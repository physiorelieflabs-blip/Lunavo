#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
const env=await readFile('.env.example','utf8');
const forbidden=['OPENAI_API_KEY','GEMINI_API_KEY','ANTHROPIC_API_KEY','DEEPSEEK_API_KEY','GOOGLE_MAPS_API_KEY','MAPBOX_ACCESS_TOKEN','TWILIO_AUTH_TOKEN','SENDGRID_API_KEY','MAILGUN_API_KEY','RESEND_API_KEY','ALGOLIA_API_KEY','PINECONE_API_KEY','AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY','CLERK_SECRET_KEY','CLERK_PUBLISHABLE_KEY'];
const violations=forbidden.filter(name=>new RegExp(`^${name}=`,`m`).test(env));
const flutterwaveKeys=['FLUTTERWAVE_SECRET_KEY','FLUTTERWAVE_WEBHOOK_SECRET'];
const malformedFlutterwave=flutterwaveKeys.filter(name=>{const match=env.match(new RegExp(`^${name}=(.*)$`,'m'));return Boolean(match?.[1]?.trim())});
if(violations.length){console.error('Lunavo self-hosted policy: FAIL');for(const name of violations)console.error(`- Forbidden core API key present: ${name}`);process.exit(1)}
console.log('Lunavo self-hosted policy: PASS');
if(malformedFlutterwave.length)console.log(`- Flutterwave adapter slots declared: ${malformedFlutterwave.join(', ')}`);
