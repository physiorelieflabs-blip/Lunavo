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
import { socialGatewayRequest } from "./social-gateway-client";

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

async function providerRequest(_url:string,_init:RequestInit):Promise<Record<string,unknown>>{throw new SocialPublishError("Direct social provider requests are disabled; use the self-hosted social gateway");}

async function refreshAccessToken(connection: Connection): Promise<{ connection: Connection; accessToken: string }> {
  const accessToken=decryptToken(connection.accessTokenEncrypted);
  if(!connection.tokenExpiresAt||connection.tokenExpiresAt.getTime()>Date.now()+60_000||!connection.refreshTokenEncrypted)return{connection,accessToken};
  const refreshToken=decryptToken(connection.refreshTokenEncrypted);
  const payload=await socialGatewayRequest<any>("oauth.refresh",{provider:connection.provider,refreshToken});
  const nextToken=String(payload.access_token||"");if(!nextToken)throw new SocialPublishError("Provider token refresh returned no access token");
  const nextRefresh=typeof payload.refresh_token==="string"?payload.refresh_token:refreshToken;const expiresIn=Number(payload.expires_in);const expiresAt=Number.isFinite(expiresIn)?new Date(Date.now()+expiresIn*1000):null;
  const[updated]=await db.update(socialConnectionsTable).set({accessTokenEncrypted:encryptToken(nextToken),refreshTokenEncrypted:encryptToken(nextRefresh),tokenExpiresAt:expiresAt,status:"connected",updatedAt:new Date()}).where(and(eq(socialConnectionsTable.id,connection.id),eq(socialConnectionsTable.merchantId,connection.merchantId))).returning();
  if(!updated)throw new SocialPublishError("Refreshed social connection could not be saved");return{connection:updated,accessToken:nextToken};
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

async function publishX(token:string,job:Job,media:{bytes:Buffer;mimeType:string;filename:string}|null):Promise<string>{const out=await socialGatewayRequest<any>("publish",{provider:"x",accessToken:token,job:{caption:job.caption},media:media?{base64:media.bytes.toString("base64"),mimeType:media.mimeType,filename:media.filename}:null});if(!out.postId)throw new SocialPublishError("X gateway did not return a post id");return String(out.postId);}

async function publishYouTube(token:string,job:Job,media:{bytes:Buffer;mimeType:string;filename:string}):Promise<string>{const out=await socialGatewayRequest<any>("publish",{provider:"youtube",accessToken:token,job:{caption:job.caption},media:{base64:media.bytes.toString("base64"),mimeType:media.mimeType,filename:media.filename}});if(!out.postId)throw new SocialPublishError("YouTube gateway did not return a video id");return String(out.postId);}

type TikTokPublishOptions={privacyLevel:string;allowComment:boolean;allowDuet:boolean;allowStitch:boolean;isAigc:boolean;consentAt:string};

async function publishTikTok(token:string,job:Job,media:{bytes:Buffer;mimeType:string},options:TikTokPublishOptions):Promise<string>{const out=await socialGatewayRequest<any>("publish",{provider:"tiktok",accessToken:token,job:{caption:job.caption,tiktokOptions:options},media:{base64:media.bytes.toString("base64"),mimeType:media.mimeType,filename:"lunavo-video.mp4"}});if(!out.postId)throw new SocialPublishError("TikTok gateway did not return a publish id");return String(out.postId);}

async function publishLinkedIn(token:string,connection:Connection,job:Job):Promise<string>{const metadata=connection.metadata&&typeof connection.metadata==="object"?connection.metadata as Record<string,unknown>:{};const author=typeof metadata.authorUrn==="string"?metadata.authorUrn:connection.accountId?.startsWith("urn:li:person:")?connection.accountId:"";if(!author)throw new SocialPublishError("LinkedIn member identity is not available; reconnect LinkedIn");const out=await socialGatewayRequest<any>("publish",{provider:"linkedin",accessToken:token,job:{caption:job.caption,authorUrn:author,linkedinApiVersion:process.env.SOCIAL_LINKEDIN_API_VERSION}});if(!out.postId)throw new SocialPublishError("LinkedIn gateway did not return a post id");return String(out.postId);}

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
  return () => clearInterval(timer);
}
