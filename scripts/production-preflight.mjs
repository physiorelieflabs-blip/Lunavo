#!/usr/bin/env node
const strict=process.argv.includes('--strict');
const errors=[];const warnings=[];
function requireEnv(name){if(!process.env[name])errors.push(`${name} is required for production.`)}
function requireUrl(name){const value=process.env[name];if(!value){errors.push(`${name} is required for production.`);return}try{const url=new URL(value);if(url.protocol!=='https:')errors.push(`${name} must use HTTPS.`)}catch{errors.push(`${name} must be a valid URL.`)}}
const forbiddenCoreKeys=new Set(['OPENAI_API_KEY','GEMINI_API_KEY','ANTHROPIC_API_KEY','DEEPSEEK_API_KEY','GOOGLE_MAPS_API_KEY','MAPBOX_ACCESS_TOKEN','TWILIO_AUTH_TOKEN','SENDGRID_API_KEY','MAILGUN_API_KEY','RESEND_API_KEY','ALGOLIA_API_KEY','PINECONE_API_KEY','AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY','CLERK_SECRET_KEY','CLERK_PUBLISHABLE_KEY']);
if(strict){requireEnv('DATABASE_URL');requireEnv('SESSION_SECRET');requireUrl('APP_BASE_URL');}
for(const[name,value]of Object.entries(process.env)){if(!value)continue;if(forbiddenCoreKeys.has(name))errors.push(`${name} must not be required by Lunavo core; use the self-hosted capability instead.`);if(/^(FLUTTERWAVE_SECRET_KEY|FLW_SECRET_KEY|FLUTTERWAVE_WEBHOOK_SECRET|FLW_WEBHOOK_HASH|DATABASE_URL|SESSION_SECRET|LUNAVO_MASTER_ADMIN_SETUP_TOKEN)$/.test(name)&&/^(changeme|replace_me|your_|test_|example)/i.test(value))errors.push(`${name} contains a placeholder value.`)}
if(strict&&!process.env.FLUTTERWAVE_SECRET_KEY&&!process.env.FLW_SECRET_KEY)warnings.push('Flutterwave Secret Key is not configured; real-money checkout remains disabled until configured in Master Admin.');
if(strict&&!process.env.FLUTTERWAVE_WEBHOOK_SECRET&&!process.env.FLW_WEBHOOK_HASH)warnings.push('Flutterwave Webhook Secret is not configured; provider webhook settlement remains disabled until configured in Master Admin.');
if(strict&&!process.env.LUNAVO_LOCAL_LLM_URL)warnings.push('No local LLM endpoint is configured; AI features will use built-in non-network fallback behaviour where available.');
if(errors.length){console.error('Lunavo production preflight: FAIL');for(const error of errors)console.error(`- ${error}`);process.exit(1)}for(const warning of warnings)console.warn(`- ${warning}`);console.log(strict?'Lunavo production preflight: PASS':'Lunavo production preflight: configuration shape OK');
