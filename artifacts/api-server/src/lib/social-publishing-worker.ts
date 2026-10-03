import { and, desc, eq, sql } from "drizzle-orm";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import {
  adCreativesTable,
  adMediaAssetsTable,
  db,
  socialConnectionsTable,
  socialPublishJobsTable,
} from "@workspace/db";
import { logger } from "./logger";

const POLL_MS = 10_000;
const LEASE_MS = 15 * 60_000;
const MAX_ATTEMPTS = 5;
const MAX_MEDIA_BYTES = 100 * 1024 * 1024;
let running = false;

type Provider = "youtube" | "tiktok" | "linkedin" | "facebook" | "instagram" | "pinterest" | "x";
type Job = typeof socialPublishJobsTable.$inferSelect;
type Connection = typeof socialConnectionsTable.$inferSelect;

class SocialPublishError extends Error {
  constructor(message: string, readonly retryable = false) {
    super(message);
  }
}

function tokenKey(): Buffer {
  const value = process.env.SOCIAL_TOKEN_ENCRYPTION_KEY?.trim();
  if (!value) throw new SocialPublishError("SOCIAL_TOKEN_ENCRYPTION_KEY is not configured");
  const key = /^[a-f0-9]{64}$/i.test(value) ? Buffer.from(value, "hex") : Buffer.from(value, "base64");
  if (key.length !== 32) throw new SocialPublishError("SOCIAL_TOKEN_ENCRYPTION_KEY must decode to 32 bytes");
  return key;
}

function decryptToken(encoded: string): string {
  const parts = encoded.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") throw new SocialPublishError("Stored social token has an unsupported encryption format");
  const [, ivEncoded, dataEncoded, tagEncoded] = parts;
  try {
    const decipher = createDecipheriv("aes-256-gcm", tokenKey(), Buffer.from(ivEncoded!, "base64url"));
    decipher.setAuthTag(Buffer.from(tagEncoded!, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(dataEncoded!, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    throw new SocialPublishError("Stored social token could not be decrypted");
  }
}

function base64Bytes(value: string): Buffer {
  const payload = value.startsWith("data:") ? value.slice(value.indexOf(",") + 1) : value;
  const bytes = Buffer.from(payload, "base64");
  if (!bytes.length) throw new SocialPublishError("Stored media is empty");
  if (bytes.length > MAX_MEDIA_BYTES) throw new SocialPublishError("Social media export exceeds the 100 MB publishing limit");
  return bytes;
}

async function providerRequest(url: string, init: RequestInit): Promise<Record<string, unknown>> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(120_000) });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const message = typeof payload.error_description === "string"
      ? payload.error_description
      : typeof payload.error === "string"
        ? payload.error
        : `Provider returned HTTP ${response.status}`;
    throw new SocialPublishError(message, response.status >= 500 || response.status === 429);
  }
  return payload;
}

async function refreshAccessToken(connection: Connection): Promise<{ connection: Connection; accessToken: string }> {
  const accessToken = decryptToken(connection.accessTokenEncrypted);
  if (!connection.tokenExpiresAt || connection.tokenExpiresAt.getTime() > Date.now() + 60_000 || !connection.refreshTokenEncrypted) {
    return { connection, accessToken };
  }

  const refreshToken = decryptToken(connection.refreshTokenEncrypted);
  let tokenUrl = "";
  let body: URLSearchParams;
  if (connection.provider === "youtube") {
    const clientId = process.env.SOCIAL_GOOGLE_CLIENT_ID?.trim();
    const clientSecret = process.env.SOCIAL_GOOGLE_CLIENT_SECRET?.trim();
    if (!clientId || !clientSecret) throw new SocialPublishError("YouTube OAuth refresh is not configured");
    tokenUrl = "https://oauth2.googleapis.com/token";
    body = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" });
  } else if (connection.provider === "linkedin") {
    const clientId = process.env.SOCIAL_LINKEDIN_CLIENT_ID?.trim();
    const clientSecret = process.env.SOCIAL_LINKEDIN_CLIENT_SECRET?.trim();
    if (!clientId || !clientSecret) throw new SocialPublishError("LinkedIn OAuth refresh is not configured");
    tokenUrl = "https://www.linkedin.com/oauth/v2/accessToken";
    body = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" });
  } else if (connection.provider === "tiktok") {
    const clientId = process.env.SOCIAL_TIKTOK_CLIENT_KEY?.trim();
    const clientSecret = process.env.SOCIAL_TIKTOK_CLIENT_SECRET?.trim();
    if (!clientId || !clientSecret) throw new SocialPublishError("TikTok OAuth refresh is not configured");
    tokenUrl = "https://open.tiktokapis.com/v2/oauth/token/";
    body = new URLSearchParams({ client_key: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" });
  } else if (connection.provider === "x") {
    const clientId = process.env.SOCIAL_X_CLIENT_ID?.trim();
    const clientSecret = process.env.SOCIAL_X_CLIENT_SECRET?.trim();
    if (!clientId || !clientSecret) throw new SocialPublishError("X OAuth refresh is not configured");
    tokenUrl = "https://api.x.com/2/oauth2/token";
    body = new URLSearchParams({ client_id: clientId, refresh_token: refreshToken, grant_type: "refresh_token" });
  } else {
    return { connection, accessToken };
  }

  const refreshHeaders: Record<string,string> = { "content-type": "application/x-www-form-urlencoded" };
  if (connection.provider === "x") {
    const clientId = process.env.SOCIAL_X_CLIENT_ID?.trim();
    const clientSecret = process.env.SOCIAL_X_CLIENT_SECRET?.trim();
    if (clientId && clientSecret) refreshHeaders.authorization = "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  }
  const payload = await providerRequest(tokenUrl, {
    method: "POST",
    headers: refreshHeaders,
    body,
  });
  if (typeof payload.access_token !== "string") throw new SocialPublishError("Provider token refresh returned no access token");
  const nextToken = payload.access_token;
  const nextRefresh = typeof payload.refresh_token === "string" ? payload.refresh_token : refreshToken;
  const expiresIn = Number(payload.expires_in);
  const expiresAt = Number.isFinite(expiresIn) ? new Date(Date.now() + expiresIn * 1000) : null;
  const [updated] = await db.update(socialConnectionsTable)
    .set({
      accessTokenEncrypted: encryptToken(nextToken),
      refreshTokenEncrypted: encryptToken(nextRefresh),
      tokenExpiresAt: expiresAt,
      status: "connected",
      updatedAt: new Date(),
    })
    .where(eq(socialConnectionsTable.id, connection.id))
    .returning();
  if (!updated) throw new SocialPublishError("Refreshed social connection could not be saved");
  return { connection: updated, accessToken: nextToken };
}

function encryptToken(value: string): string {
  const key = tokenKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${data.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}`;
}

async function loadMedia(job: Job): Promise<{ bytes: Buffer; mimeType: string; filename: string } | null> {
  if (job.adMediaAssetId) {
    const [asset] = await db.select({
      mediaData: adMediaAssetsTable.mediaData,
      mimeType: adMediaAssetsTable.mimeType,
      filename: adMediaAssetsTable.filename,
    }).from(adMediaAssetsTable).where(and(eq(adMediaAssetsTable.id, job.adMediaAssetId), eq(adMediaAssetsTable.merchantId, job.merchantId))).limit(1);
    if (!asset) throw new SocialPublishError("Queued media asset was not found");
    return { bytes: base64Bytes(asset.mediaData), mimeType: asset.mimeType || "application/octet-stream", filename: asset.filename || "lunavo-media" };
  }
  if (job.creativeId) {
    const [creative] = await db.select({
      videoData: adCreativesTable.videoData,
      mimeType: adCreativesTable.mimeType,
      title: adCreativesTable.title,
    }).from(adCreativesTable).where(and(eq(adCreativesTable.id, job.creativeId), eq(adCreativesTable.merchantId, job.merchantId))).limit(1);
    if (!creative?.videoData) throw new SocialPublishError("Queued creative has no persisted video data");
    return { bytes: base64Bytes(creative.videoData), mimeType: creative.mimeType || "video/mp4", filename: `${(creative.title || "lunavo-creative").replace(/[^a-z0-9_-]+/gi, "-").slice(0, 80)}.mp4` };
  }
  return null;
}

async function publishX(token: string, job: Job, media: { bytes: Buffer; mimeType: string; filename: string } | null): Promise<string> {
  if (media) throw new SocialPublishError("X publishing currently supports text-only jobs; media remains provider-gated");
  const text = (job.caption || "").trim();
  if (!text) throw new SocialPublishError("X publishing requires a caption");
  if (Array.from(text).length > 280) throw new SocialPublishError("X text posts are limited to 280 characters in Lunavo");
  const payload = await providerRequest("https://api.x.com/2/tweets", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  const data = payload.data && typeof payload.data === "object" ? payload.data as Record<string, unknown> : {};
  if (typeof data.id !== "string") throw new SocialPublishError("X did not return a post id");
  return data.id;
}

async function publishYouTube(token: string, job: Job, media: { bytes: Buffer; mimeType: string; filename: string }): Promise<string> {
  if (!media.mimeType.startsWith("video/")) throw new SocialPublishError("YouTube publishing requires video media");
  const rawTitle = (job.caption || media.filename.replace(/\.[^.]+$/, "") || "Lunavo").replace(/\s+/g, " ").trim();
  const metadata = {
    snippet: { title: rawTitle.slice(0, 100) || "Lunavo", description: (job.caption || "").slice(0, 5000) },
    status: { privacyStatus: "public" },
  };
  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
  form.append("media", new Blob([new Uint8Array(media.bytes)], { type: media.mimeType }), media.filename);
  const payload = await providerRequest("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (typeof payload.id !== "string") throw new SocialPublishError("YouTube did not return a video id");
  return payload.id;
}

type TikTokPublishOptions={privacyLevel:string;allowComment:boolean;allowDuet:boolean;allowStitch:boolean;isAigc:boolean;consentAt:string};

async function publishTikTok(token: string, job: Job, media: { bytes: Buffer; mimeType: string }, options: TikTokPublishOptions): Promise<string> {
  if (!media.mimeType.startsWith("video/")) throw new SocialPublishError("TikTok direct publishing currently supports video jobs in Lunavo");
  const consentAt=Date.parse(options.consentAt);
  if (!Number.isFinite(consentAt)||consentAt>Date.now()+60_000) throw new SocialPublishError("TikTok publish consent timestamp is invalid");
  if (media.bytes.length > MAX_MEDIA_BYTES) throw new SocialPublishError("TikTok video exceeds Lunavo's publishing limit");

  const creatorPayload = await providerRequest("https://open.tiktokapis.com/v2/post/publish/creator_info/query/", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8" },
    body: "{}",
  });
  const creator = payloadData(creatorPayload);
  const privacyOptions=Array.isArray(creator.privacy_level_options)?creator.privacy_level_options.filter((value):value is string=>typeof value==="string"):[];
  if (!privacyOptions.includes(options.privacyLevel)) throw new SocialPublishError("TikTok privacy selection is no longer available for this creator; reload the creator settings");
  if (creator.comment_disabled===true && options.allowComment) throw new SocialPublishError("TikTok has comments disabled for this creator");
  if (creator.duet_disabled===true && options.allowDuet) throw new SocialPublishError("TikTok has Duet disabled for this creator");
  if (creator.stitch_disabled===true && options.allowStitch) throw new SocialPublishError("TikTok has Stitch disabled for this creator");
  const maxDuration=Number(creator.max_video_post_duration_sec);
  if (Number.isFinite(maxDuration) && job.creativeId) {
    const [creative] = await db.select({durationSeconds: adCreativesTable.durationSeconds}).from(adCreativesTable).where(and(eq(adCreativesTable.id, job.creativeId), eq(adCreativesTable.merchantId, job.merchantId))).limit(1);
    if (creative && creative.durationSeconds > maxDuration) throw new SocialPublishError(`TikTok currently allows videos up to ${maxDuration} seconds for this creator`);
  }

  const chunkSize = 10_000_000;
  const totalChunkCount = Math.ceil(media.bytes.length / chunkSize);
  const title = (job.caption || "Lunavo").slice(0, 2200);
  const init = await providerRequest("https://open.tiktokapis.com/v2/post/publish/video/init/", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify({
      post_info: {
        title,
        privacy_level: options.privacyLevel,
        disable_duet: !options.allowDuet,
        disable_comment: !options.allowComment,
        disable_stitch: !options.allowStitch,
        brand_organic_toggle: true,
        is_aigc: options.isAigc,
      },
      source_info: { source: "FILE_UPLOAD", video_size: media.bytes.length, chunk_size: chunkSize, total_chunk_count: totalChunkCount },
    }),
  });
  const data = payloadData(init);
  const publishId = typeof data.publish_id === "string" ? data.publish_id : "";
  const uploadUrl = typeof data.upload_url === "string" ? data.upload_url : "";
  if (!publishId || !uploadUrl) throw new SocialPublishError("TikTok did not return upload details");

  for (let offset = 0; offset < media.bytes.length; offset += chunkSize) {
    const chunk = media.bytes.subarray(offset, Math.min(offset + chunkSize, media.bytes.length));
    const end = offset + chunk.length - 1;
    const response = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": media.mimeType,
        "Content-Length": String(chunk.length),
        "Content-Range": `bytes ${offset}-${end}/${media.bytes.length}`,
      },
      body: chunk,
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) throw new SocialPublishError(`TikTok media upload returned HTTP ${response.status}`, response.status >= 500 || response.status === 429);
  }
  const statusPayload = await providerRequest("https://open.tiktokapis.com/v2/post/publish/status/fetch/", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify({ publish_id: publishId }),
  });
  const statusData = payloadData(statusPayload);
  const status = typeof statusData.status === "string" ? statusData.status : "";
  if (status === "FAILED") throw new SocialPublishError(typeof statusData.fail_reason === "string" ? `TikTok rejected the post: ${statusData.fail_reason}` : "TikTok rejected the post");
  return publishId;
}

async function publishLinkedIn(token: string, connection: Connection, job: Job): Promise<string> {
  const metadata = connection.metadata && typeof connection.metadata === "object" ? connection.metadata as Record<string, unknown> : {};
  const author = typeof metadata.authorUrn === "string" ? metadata.authorUrn : connection.accountId && connection.accountId.startsWith("urn:li:person:") ? connection.accountId : "";
  if (!author) throw new SocialPublishError("LinkedIn member identity is not available; reconnect LinkedIn to refresh the account identity");
  const version = process.env.SOCIAL_LINKEDIN_API_VERSION?.trim();
  if (!version) throw new SocialPublishError("SOCIAL_LINKEDIN_API_VERSION is not configured");
  const response = await fetch("https://api.linkedin.com/rest/posts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
      "Linkedin-Version": version,
    },
    body: JSON.stringify({
      author,
      commentary: (job.caption || "").slice(0, 3000),
      visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new SocialPublishError(detail.slice(0, 1000) || `LinkedIn returned HTTP ${response.status}`, response.status >= 500 || response.status === 429);
  }
  const postId = response.headers.get("x-restli-id") || "";
  if (!postId) throw new SocialPublishError("LinkedIn did not return a post id");
  return postId;
}

function payloadData(payload: Record<string, unknown>): Record<string, unknown> {
  return payload.data && typeof payload.data === "object" ? payload.data as Record<string, unknown> : {};
}


async function publishJob(job: Job, connection: Connection, token: string, media: { bytes: Buffer; mimeType: string; filename: string } | null): Promise<string> {
  switch (job.provider as Provider) {
    case "youtube":
      if (!media) throw new SocialPublishError("YouTube publishing requires a persisted video");
      return publishYouTube(token, job, media);
    case "tiktok": {
      if (!media) throw new SocialPublishError("TikTok publishing requires a persisted video");
      const root=job.publishOptions&&typeof job.publishOptions==="object"?job.publishOptions as Record<string,unknown>:{};
      const raw=root.tiktok;
      if (!raw||typeof raw!=="object") throw new SocialPublishError("TikTok publishing options are missing; choose the creator settings in Social Hub");
      const o=raw as Record<string,unknown>;
      const options: TikTokPublishOptions={privacyLevel:typeof o.privacyLevel==="string"?o.privacyLevel:"",allowComment:o.allowComment===true,allowDuet:o.allowDuet===true,allowStitch:o.allowStitch===true,isAigc:o.isAigc===true,consentAt:typeof o.consentAt==="string"?o.consentAt:""};
      if (!options.privacyLevel || !options.consentAt) throw new SocialPublishError("TikTok publishing options are incomplete");
      return publishTikTok(token, job, media, options);
    }
    case "linkedin":
      if (media) throw new SocialPublishError("LinkedIn media publishing is not enabled in this queue yet; use a text-only LinkedIn job");
      return publishLinkedIn(token, connection, job);
    case "x":
      return publishX(token, job, media);
    case "facebook":
    case "instagram":
    case "pinterest":
    case "x":
      throw new SocialPublishError(`${job.provider} publishing requires its provider-specific publishing adapter and is not silently simulated`);
    default:
      throw new SocialPublishError("Unsupported social provider");
  }
}

async function claimJob(): Promise<Job | null> {
  await db.execute(sql`UPDATE social_publish_jobs SET status='queued', locked_at=NULL, updated_at=now(), error_message='Worker lease expired; retrying.' WHERE status='processing' AND locked_at < now() - interval '15 minutes' AND attempts < ${MAX_ATTEMPTS}`);
  const result = await db.execute(sql`
    UPDATE social_publish_jobs
    SET status='processing', attempts=attempts+1, locked_at=now(), updated_at=now()
    WHERE id = (
      SELECT id
      FROM social_publish_jobs
      WHERE status='queued' AND attempts < ${MAX_ATTEMPTS}
      ORDER BY created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING *
  `);
  return (result.rows[0] as Job | undefined) ?? null;
}

async function processOne(): Promise<void> {
  const job = await claimJob();
  if (!job) return;
  try {
    const [connection] = job.connectionId
      ? await db.select().from(socialConnectionsTable).where(and(eq(socialConnectionsTable.id, job.connectionId), eq(socialConnectionsTable.merchantId, job.merchantId))).limit(1)
      : [];
    if (!connection || connection.status !== "connected") throw new SocialPublishError("The connected social account is unavailable; reconnect it before publishing");
    const auth = await refreshAccessToken(connection);
    const media = await loadMedia(job);
    const externalPostId = await publishJob(job, auth.connection, auth.accessToken, media);
    await db.update(socialPublishJobsTable).set({ status: "published", externalPostId, errorMessage: null, lockedAt: null, updatedAt: new Date(), publishedAt: new Date() })
      .where(and(eq(socialPublishJobsTable.id, job.id), eq(socialPublishJobsTable.merchantId, job.merchantId)));
  } catch (error) {
    const retryable = error instanceof SocialPublishError ? error.retryable : true;
    const message = error instanceof Error ? error.message : "Social publish worker failed";
    const finalFailure = !retryable || job.attempts >= MAX_ATTEMPTS;
    await db.update(socialPublishJobsTable).set({
      status: finalFailure ? "failed" : "queued",
      errorMessage: message.slice(0, 2000),
      lockedAt: null,
      updatedAt: new Date(),
    }).where(and(eq(socialPublishJobsTable.id, job.id), eq(socialPublishJobsTable.merchantId, job.merchantId)));
    logger.error({ err: error, jobId: job.id, provider: job.provider, retryable, attempts: job.attempts }, "Social publish job failed");
  }
}

export function startSocialPublishingWorker(intervalMs = POLL_MS) {
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    void processOne().catch((error) => logger.error({ err: error }, "Social publishing worker batch crashed")).finally(() => { running = false; });
  }, intervalMs);
  timer.unref();
  void processOne().catch((error) => logger.error({ err: error }, "Initial social publishing worker run failed"));
  return timer;
}
