import express,{type Express} from "express";
import path from "node:path";
import {existsSync} from "node:fs";
import pinoHttp from "pino-http";
import router from "./routes";
import {logger} from "./lib/logger";
import {eq, sql} from "drizzle-orm";
import {db, merchantStorefrontDomainsTable} from "@workspace/db";
import {authenticateRequest} from "./lib/local-auth";
const app:Express=express();
app.set("trust proxy",1);
const rateBuckets=new Map<string,{windowStartedAt:number;count:number}>();
const MAX_RATE_KEYS = 20_000;
function rateLimit(prefix:string,limit:number,windowMs:number){return(req:express.Request,res:express.Response,next:express.NextFunction)=>{const ip=(req.ip||"unknown").trim();const key=prefix+":"+ip;const now=Date.now();const current=rateBuckets.get(key);if(!current||now-current.windowStartedAt>=windowMs){if(!current&&rateBuckets.size>=MAX_RATE_KEYS){let oldestKey:string|undefined;let oldestAt=Number.POSITIVE_INFINITY;for(const[candidateKey,candidate]of rateBuckets){if(candidate.windowStartedAt<oldestAt){oldestKey=candidateKey;oldestAt=candidate.windowStartedAt;}}if(oldestKey)rateBuckets.delete(oldestKey);}rateBuckets.set(key,{windowStartedAt:now,count:1});next();return;}current.count+=1;if(current.count>limit){res.setHeader("Retry-After",String(Math.ceil((windowMs-(now-current.windowStartedAt))/1000)));res.status(429).json({error:"Too many requests. Please try again shortly."});return;}next();};}
setInterval(()=>{const cutoff=Date.now()-10*60*1000;for(const[key,value]of rateBuckets)if(value.windowStartedAt<cutoff)rateBuckets.delete(key);},5*60*1000).unref();
const customDomainCache=new Map<string,{found:boolean;expiresAt:number}>();
function normalizeHost(value:string){const raw=value.trim().toLowerCase();if(!raw)return "";try{return new URL(raw.includes("://")?raw:`https://${raw}`).hostname.replace(/^www\./,"");}catch{return raw.replace(/^https?:\/\//,"").split("/")[0].replace(/^www\./,"");}}
app.disable("x-powered-by");
app.use((req,res,next)=>{res.setHeader("X-Content-Type-Options","nosniff");res.setHeader("X-Frame-Options","SAMEORIGIN");res.setHeader("Referrer-Policy",/^\/(?:api\/public\/invitations|invite)(?:\/|$)/.test(req.path)?"no-referrer":"strict-origin-when-cross-origin");res.setHeader("Permissions-Policy","camera=(), microphone=(), geolocation=()");res.setHeader("Cross-Origin-Opener-Policy","same-origin-allow-popups");res.setHeader("Cross-Origin-Resource-Policy","same-origin");if(process.env.NODE_ENV==="production")res.setHeader("Strict-Transport-Security","max-age=31536000; includeSubDomains");next();});
app.use(pinoHttp({logger,serializers:{req(req){const pathname=req.url?.split("?")[0]?.replace(/\/public\/invitations\/[^/]+/g,"/public/invitations/:redacted");return{id:req.id,method:req.method,url:pathname};},res(res){return{statusCode:res.statusCode};}}}));
app.use(authenticateRequest);
app.use((req,res,next)=>{
  if((req.method==="GET"||req.method==="HEAD"||req.method==="OPTIONS") || req.path.startsWith("/api/webhooks/")) { next(); return; }
  const origin=req.get("origin");
  if(!origin){ next(); return; }
  try{
    const originUrl=new URL(origin);
    const configured=new URL(process.env.APP_BASE_URL||`${req.protocol}://${req.get("host")}`);
    const sameOrigin=originUrl.protocol===configured.protocol && originUrl.host===configured.host;
    if(!sameOrigin){ res.status(403).json({error:"Cross-origin state-changing request rejected"}); return; }
  }catch{
    res.status(403).json({error:"Invalid request origin"}); return;
  }
  next();
});
app.use("/api/webhooks/flutterwave",express.raw({type:"application/json",limit:"256kb"}));
app.use("/api/media",express.json({limit:"8mb"}));
app.use("/api/ads/media",express.json({limit:"36mb"}));app.use("/api/kyc",express.json({limit:"10mb"}));
app.use(express.json({limit:"64kb"}));
app.use(express.urlencoded({extended:true,limit:"64kb"}));
app.use("/api/public/checkout",rateLimit("public-checkout",30,60_000));app.use("/api/growth/discovery/events",rateLimit("growth-discovery",120,60_000));
app.use("/api/auth/sign-in",rateLimit("auth-sign-in",10,60_000));app.use("/api/auth/login",rateLimit("auth-sign-in",10,60_000));
app.use("/api/auth/sign-up",rateLimit("auth-sign-up",10,60_000));app.use("/api/auth/register",rateLimit("auth-sign-up",10,60_000));
app.use("/api/auth/reset/request",rateLimit("auth-reset-request",5,60_000));app.use("/api/auth/password-reset-request",rateLimit("auth-reset-request",5,60_000));
app.use("/api/auth/reset/verify",rateLimit("auth-reset-verify",20,60_000));
app.use("/api/auth/mfa/verify",rateLimit("auth-mfa-verify",12,60_000));app.use("/api/auth/verify-email",rateLimit("auth-verify-email",10,10*60_000));app.use("/api/auth/resend-verification",rateLimit("auth-resend-verification",3,10*60_000));
app.use("/api/auth/mfa/setup",rateLimit("auth-mfa-setup",6,10*60_000));
app.use("/api/auth/mfa/confirm",rateLimit("auth-mfa-confirm",12,60_000));app.use("/api/auth/reset/complete",rateLimit("auth-reset-complete",10,60_000));app.use("/api/auth/password-reset",rateLimit("auth-reset-complete",10,60_000));app.use("/api/auth/change-password",rateLimit("auth-change-password",6,10*60_000));app.use("/api/kyc",rateLimit("merchant-kyc",6,10*60_000));
app.use("/api/ads/generator",rateLimit("ad-generator",6,60_000));
app.use("/api/ai/generate-image",rateLimit("image-generator",8,60_000));
app.use("/api/ads/media",rateLimit("ad-media-upload",10,60_000));
app.get("/",async(req,res,next)=>{const host=normalizeHost(req.hostname||"");const canonical=normalizeHost(process.env.APP_BASE_URL||"");if(!host||host==="localhost"||host==="127.0.0.1"||host===canonical){next();return;}const cached=customDomainCache.get(host);if(cached&&cached.expiresAt>Date.now()){if(cached.found)res.redirect(302,"/store/by-host");else next();return;}try{const row=(await db.select({storefrontId:merchantStorefrontDomainsTable.storefrontId}).from(merchantStorefrontDomainsTable).where(eq(merchantStorefrontDomainsTable.hostname,host)).limit(1))[0];let found=false;if(row?.storefrontId){const published=(await db.execute(sql\`SELECT 1 FROM merchant_storefronts ms JOIN merchants m ON m.id=ms.merchant_id WHERE ms.id=\${row.storefrontId} AND ms.published=true AND m.status='active' LIMIT 1\`)).rows.length>0;found=published;}if(customDomainCache.size>=10000&&!cached){const oldest=customDomainCache.keys().next().value;if(typeof oldest==="string")customDomainCache.delete(oldest);}customDomainCache.set(host,{found,expiresAt:Date.now()+60_000});if(found){res.redirect(302,"/store/by-host");return;}next();}catch(error){next(error);}});
app.use("/api",router);
const webDistPath=path.resolve(import.meta.dirname,"../../ts-commerce/dist/public");
if(existsSync(webDistPath)){app.use(express.static(webDistPath,{index:"index.html",maxAge:process.env.NODE_ENV==="production"?"1h":0}));app.use((req,res,next)=>{if(req.method!=="GET"||req.path.startsWith("/api/")||req.path==="/api"){next();return;}res.sendFile(path.join(webDistPath,"index.html"),(error)=>{if(error)next(error);});});}
app.use((error:unknown,req:express.Request,res:express.Response,next:express.NextFunction)=>{if(res.headersSent){next(error);return;}const statusCode=error&&typeof error==='object'&&'statusCode'in error&&(error as{statusCode?:unknown}).statusCode===403?403:500;if(statusCode===403)req.log.warn({err:error},"Merchant authorization denied");else req.log.error({err:error},"Unhandled request error");res.status(statusCode).json({error:statusCode===403?"You do not have permission for this action":"Internal server error"});});
export default app;
