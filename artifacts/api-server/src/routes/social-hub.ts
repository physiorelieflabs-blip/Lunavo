import { Router, type Request, type Response } from "express";
import { and, desc, eq } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { createHmac } from "node:crypto";
import { db, merchantsTable, socialConnectionsTable, socialPublishJobsTable } from "@workspace/db";

const router = Router();
const PROVIDERS = {
  instagram: { label: "Instagram", requiredEnv: ["SOCIAL_META_CLIENT_ID", "SOCIAL_META_CLIENT_SECRET"] },
  facebook: { label: "Facebook", requiredEnv: ["SOCIAL_META_CLIENT_ID", "SOCIAL_META_CLIENT_SECRET"] },
  tiktok: { label: "TikTok", requiredEnv: ["SOCIAL_TIKTOK_CLIENT_KEY", "SOCIAL_TIKTOK_CLIENT_SECRET"] },
  youtube: { label: "YouTube", requiredEnv: ["SOCIAL_GOOGLE_CLIENT_ID", "SOCIAL_GOOGLE_CLIENT_SECRET"] },
  linkedin: { label: "LinkedIn", requiredEnv: ["SOCIAL_LINKEDIN_CLIENT_ID", "SOCIAL_LINKEDIN_CLIENT_SECRET"] },
  pinterest: { label: "Pinterest", requiredEnv: ["SOCIAL_PINTEREST_CLIENT_ID", "SOCIAL_PINTEREST_CLIENT_SECRET"] },
  x: { label: "X", requiredEnv: ["SOCIAL_X_CLIENT_ID", "SOCIAL_X_CLIENT_SECRET"] },
} as const;
type Provider = keyof typeof PROVIDERS;

async function merchantFor(req: Request) {
  const userId = getAuth(req).userId;
  if (!userId) return null;
  return (await db.select().from(merchantsTable).where(eq(merchantsTable.clerkUserId, userId)).limit(1))[0] ?? null;
}
function fail(res: Response, status: number, error: string) { res.status(status).json({ error }); }
function validProvider(value: string): value is Provider { return Object.prototype.hasOwnProperty.call(PROVIDERS, value); }
function configured(provider: Provider) { return PROVIDERS[provider].requiredEnv.every((key) => Boolean(process.env[key])); }
function oauthState(merchantId: number, provider: Provider) { const payload = `${merchantId}:${provider}:${Date.now()}`; const secret = process.env.SOCIAL_OAUTH_STATE_SECRET; if (!secret) throw new Error("SOCIAL_OAUTH_STATE_SECRET is not configured"); const sig=createHmac("sha256",secret).update(payload).digest("hex"); return Buffer.from(`${payload}:${sig}`).toString("base64url"); }

router.get("/social/providers", async (req,res)=>{ const merchant=await merchantFor(req); if(!merchant)return fail(res,401,"Authentication required"); const connections=await db.select().from(socialConnectionsTable).where(eq(socialConnectionsTable.merchantId,merchant.id)).orderBy(desc(socialConnectionsTable.updatedAt)); const connected=new Map(connections.map((c)=>[c.provider,c])); res.json(Object.entries(PROVIDERS).map(([provider,meta])=>({provider,label:meta.label,configured:configured(provider as Provider),connected:connected.has(provider),accountName:connected.get(provider)?.accountName??null,status:connected.get(provider)?.status??"disconnected"}))); });

router.get("/social/connect/:provider", async(req,res)=>{ const merchant=await merchantFor(req); if(!merchant)return fail(res,401,"Authentication required"); const provider=req.params.provider; if(!validProvider(provider))return fail(res,400,"Unsupported social provider"); if(!configured(provider))return res.status(503).json({error:`${PROVIDERS[provider].label} connection is not configured on this TS Commerce deployment`,requiredEnv:PROVIDERS[provider].requiredEnv}); let authorizeUrl=""; const redirectUri=process.env.SOCIAL_OAUTH_CALLBACK_URL; if(!redirectUri)return fail(res,503,"SOCIAL_OAUTH_CALLBACK_URL is not configured"); const state=oauthState(merchant.id,provider);
  if(provider==='tiktok') authorizeUrl=`https://www.tiktok.com/v2/auth/authorize/?client_key=${encodeURIComponent(process.env.SOCIAL_TIKTOK_CLIENT_KEY!)}&response_type=code&scope=user.info.basic,video.publish&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`;
  else if(provider==='youtube') authorizeUrl=`https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(process.env.SOCIAL_GOOGLE_CLIENT_ID!)}&response_type=code&access_type=offline&prompt=consent&scope=${encodeURIComponent('https://www.googleapis.com/auth/youtube.upload')}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`;
  else if(provider==='linkedin') authorizeUrl=`https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${encodeURIComponent(process.env.SOCIAL_LINKEDIN_CLIENT_ID!)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent('openid profile w_member_social')}&state=${encodeURIComponent(state)}`;
  else if(provider==='pinterest') authorizeUrl=`https://www.pinterest.com/oauth/?client_id=${encodeURIComponent(process.env.SOCIAL_PINTEREST_CLIENT_ID!)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent('boards:read boards:write pins:read pins:write')}&state=${encodeURIComponent(state)}`;
  else if(provider==='x') authorizeUrl=`https://twitter.com/i/oauth2/authorize?response_type=code&client_id=${encodeURIComponent(process.env.SOCIAL_X_CLIENT_ID!)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent('tweet.read tweet.write users.read offline.access')}&state=${encodeURIComponent(state)}&code_challenge=TS_COMMERCE_PKCE_REQUIRED&code_challenge_method=plain`;
  else authorizeUrl=`https://www.facebook.com/v24.0/dialog/oauth?client_id=${encodeURIComponent(process.env.SOCIAL_META_CLIENT_ID!)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}&scope=${encodeURIComponent('pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish')}`;
  res.json({provider,label:PROVIDERS[provider].label,authorizeUrl}); });

router.delete("/social/connections/:id", async(req,res)=>{ const merchant=await merchantFor(req); if(!merchant)return fail(res,401,"Authentication required"); const deleted=await db.delete(socialConnectionsTable).where(and(eq(socialConnectionsTable.id,req.params.id),eq(socialConnectionsTable.merchantId,merchant.id))).returning({id:socialConnectionsTable.id}); if(!deleted.length)return fail(res,404,"Social connection not found"); res.status(204).end(); });

router.get("/social/publish-jobs", async(req,res)=>{ const merchant=await merchantFor(req); if(!merchant)return fail(res,401,"Authentication required"); const jobs=await db.select({id:socialPublishJobsTable.id,provider:socialPublishJobsTable.provider,caption:socialPublishJobsTable.caption,status:socialPublishJobsTable.status,externalPostId:socialPublishJobsTable.externalPostId,errorMessage:socialPublishJobsTable.errorMessage,createdAt:socialPublishJobsTable.createdAt,publishedAt:socialPublishJobsTable.publishedAt}).from(socialPublishJobsTable).where(eq(socialPublishJobsTable.merchantId,merchant.id)).orderBy(desc(socialPublishJobsTable.createdAt)).limit(100); res.json(jobs); });

router.post("/social/publish", async(req,res)=>{ const merchant=await merchantFor(req); if(!merchant)return fail(res,401,"Authentication required"); const providers=Array.isArray(req.body?.providers)?req.body.providers.filter((v:unknown):v is string=>typeof v==='string'&&validProvider(v)).slice(0,7):[]; if(!providers.length)return fail(res,400,"Choose at least one social platform"); const caption=typeof req.body?.caption==='string'?req.body.caption.trim().slice(0,4000):null; const creativeId=typeof req.body?.creativeId==='string'?req.body.creativeId:null; const mediaId=typeof req.body?.adMediaAssetId==='string'?req.body.adMediaAssetId:null; const results=[];
  for(const provider of providers){ const [connection]=await db.select().from(socialConnectionsTable).where(and(eq(socialConnectionsTable.merchantId,merchant.id),eq(socialConnectionsTable.provider,provider),eq(socialConnectionsTable.status,'connected'))).limit(1); if(!connection){results.push({provider,status:'not_connected'});continue;} const key=`publish:${provider}:${creativeId??mediaId??'none'}:${caption??''}`; const [job]=await db.insert(socialPublishJobsTable).values({merchantId:merchant.id,connectionId:connection.id,creativeId,adMediaAssetId:mediaId,provider,caption,status:'queued',idempotencyKey:createHmac('sha256',process.env.SOCIAL_OAUTH_STATE_SECRET||'ts-commerce').update(key).digest('hex')}).onConflictDoNothing({target:socialPublishJobsTable.idempotencyKey}).returning(); if(!job){results.push({provider,status:'duplicate'});continue;} results.push({provider,status:'queued',jobId:job.id}); }
  res.status(202).json({results,message:'Publish jobs were queued only for connected accounts. A job becomes published only after the provider confirms success.'}); });

export default router;
