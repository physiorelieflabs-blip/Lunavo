#!/usr/bin/env node
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const env=await readFile(".env.example","utf8");
const failures=[];
const forbiddenKeys=["OPENAI_API_KEY","GEMINI_API_KEY","ANTHROPIC_API_KEY","DEEPSEEK_API_KEY","GOOGLE_MAPS_API_KEY","MAPBOX_ACCESS_TOKEN","TWILIO_AUTH_TOKEN","SENDGRID_API_KEY","MAILGUN_API_KEY","RESEND_API_KEY","ALGOLIA_API_KEY","PINECONE_API_KEY","AWS_ACCESS_KEY_ID","AWS_SECRET_ACCESS_KEY","CLERK_SECRET_KEY","CLERK_PUBLISHABLE_KEY"];
for(const key of forbiddenKeys)if(new RegExp("^"+key+"=","m").test(env))failures.push("Forbidden hosted API key slot: "+key);
const forbiddenUrls=["api.openai.com","api.anthropic.com","generativelanguage.googleapis.com","api.deepseek.com","api.stripe.com","api.paystack.co","api.paypal.com","api.twilio.com","api.sendgrid.com","api.resend.com","api.mapbox.com","maps.googleapis.com","s3.amazonaws.com","storage.googleapis.com","appwrite.io","supabase.co","firebaseio.com","algolia.net","pinecone.io","sentry.io","posthog.com","open.er-api.com"];
const localEndpointVars=["LUNAVO_LOCAL_LLM_URL","LUNAVO_LOCAL_AI_BASE_URL","LUNAVO_LOCAL_EMBEDDINGS_URL","LUNAVO_LOCAL_IMAGE_URL","LUNAVO_LOCAL_VIDEO_URL","LUNAVO_LOCAL_SEARCH_URL","LUNAVO_LOCAL_FX_URL","LUNAVO_SOCIAL_GATEWAY_URL"];
for(const variable of localEndpointVars){const m=env.match(new RegExp("^"+variable+"=(.*)$","m"));if(!m?.[1]?.trim())continue;try{const u=new URL(m[1].trim());if(!["http:","https:"].includes(u.protocol))failures.push("Bad local integration protocol: "+variable);if(variable!=="LUNAVO_SOCIAL_GATEWAY_URL"&&!/^(localhost|127\.0\.0\.1|0\.0\.0\.0|[a-z0-9.-]+)$/i.test(u.hostname))failures.push("Unexpected local integration host: "+variable+" -> "+u.hostname);}catch{failures.push("Malformed local integration URL: "+variable);}}
async function walk(dir){const entries=await readdir(dir,{withFileTypes:true});const files=[];for(const entry of entries){if(["node_modules","dist",".git"].includes(entry.name))continue;const full=path.join(dir,entry.name);if(entry.isDirectory())files.push(...await walk(full));else if(/\.(ts|tsx|js|mjs|cjs)$/.test(entry.name))files.push(full);}return files;}
for(const root of ["artifacts/api-server/src","artifacts/ts-commerce/src"]){for(const file of await walk(root)){const source=await readFile(file,"utf8");const relative=file.replaceAll("\\","/");for(const host of forbiddenUrls)if(source.includes(host))failures.push("Hosted service URL remains in Lunavo core: "+relative+" -> "+host);if(/process\.env\.(SMTP_HOST|SMTP_PORT|SMTP_USER|SMTP_PASSWORD|SMTP_FROM)\b/.test(source))failures.push("Remote SMTP configuration remains in Lunavo core: "+relative);}}
const compose=await readFile("docker-compose.yml","utf8");
if(compose.includes("FX_UPSTREAM_URL")||compose.includes("open.er-api.com"))failures.push("FX gateway cannot use an external upstream");
if(!compose.includes("FX_RATES_FILE: /data/lunavo/fx-rates.json"))failures.push("Self-hosted FX ratebook is not mounted in Compose");
if(!compose.includes("LUNAVO_LOCAL_EMBEDDINGS_URL: ${LUNAVO_LOCAL_EMBEDDINGS_URL:-http://ollama:11434/v1/embeddings}"))failures.push("Compose embeddings endpoint is not local");
const apiPackage=JSON.parse(await readFile("artifacts/api-server/package.json","utf8"));
const webPackage=JSON.parse(await readFile("artifacts/ts-commerce/package.json","utf8"));
const bannedPackages=["@clerk/express","@clerk/shared","@clerk/react","@clerk/themes","http-proxy-middleware","nodemailer"];
for(const name of bannedPackages){if(apiPackage.dependencies?.[name]||apiPackage.devDependencies?.[name]||webPackage.dependencies?.[name]||webPackage.devDependencies?.[name])failures.push("Hosted-service dependency remains installed: "+name);}
const rootPackage=await readFile("package.json","utf8");if(rootPackage.includes("@replit/"))failures.push("Hosted runtime dependency remains in root package");
if(failures.length){console.error("Lunavo total self-hosted policy: FAIL");for(const failure of failures)console.error("- "+failure);process.exit(1);}
console.log("Lunavo total self-hosted policy: PASS");
console.log("Core network boundary: self-hosted/local infrastructure only; Flutterwave is the sole external payment rail.");
