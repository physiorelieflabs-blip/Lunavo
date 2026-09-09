#!/usr/bin/env node
import { readFile } from 'node:fs/promises';

const env = await readFile('.env.example', 'utf8');
const forbidden = [
  'OPENAI_API_KEY',
  'GEMINI_API_KEY',
  'ANTHROPIC_API_KEY',
  'DEEPSEEK_API_KEY',
  'GOOGLE_MAPS_API_KEY',
  'MAPBOX_ACCESS_TOKEN',
  'TWILIO_AUTH_TOKEN',
  'SENDGRID_API_KEY',
  'MAILGUN_API_KEY',
  'RESEND_API_KEY',
  'ALGOLIA_API_KEY',
  'PINECONE_API_KEY',
];

const violations = forbidden.filter((name) => new RegExp(`^${name}=`, 'm').test(env));
const required = ['FLUTTERWAVE_SECRET_KEY', 'FLUTTERWAVE_WEBHOOK_SECRET'];
const missing = required.filter((name) => !new RegExp(`^${name}=`, 'm').test(env));

if (violations.length || missing.length) {
  console.error('Lunavo self-hosted policy: FAIL');
  for (const name of violations) console.error(`- Forbidden core API key present: ${name}`);
  for (const name of missing) console.error(`- Required payment provider secret missing from environment contract: ${name}`);
  process.exit(1);
}

console.log('Lunavo self-hosted policy: PASS');
