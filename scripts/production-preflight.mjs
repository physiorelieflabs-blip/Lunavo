#!/usr/bin/env node

const strict = process.argv.includes('--strict');
const errors = [];

function requireEnv(name) {
  if (!process.env[name]) errors.push(`${name} is required for production.`);
}

function requireAnyEnv(...names) {
  if (!names.some((name) => process.env[name])) errors.push(`${names.join(' or ')} is required for production.`);
}

function requireUrl(name) {
  const value = process.env[name];
  if (!value) {
    errors.push(`${name} is required for production.`);
    return;
  }
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') errors.push(`${name} must use HTTPS.`);
  } catch {
    errors.push(`${name} must be a valid URL.`);
  }
}

// Third-party AI/maps/messaging/search keys are deliberately forbidden as
// core dependencies. If one is present, it is a configuration smell that can
// accidentally turn an optional integration into a hard runtime dependency.
const forbiddenCoreKeys = new Set([
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
]);

if (strict) {
  requireEnv('DATABASE_URL');
  // Authentication, AI, search, media, notifications, analytics and other
  // non-payment capabilities must remain self-hosted/API-independent.
  requireAnyEnv('FLUTTERWAVE_SECRET_KEY', 'FLW_SECRET_KEY');
  requireAnyEnv('FLUTTERWAVE_WEBHOOK_SECRET', 'FLW_WEBHOOK_HASH');
  requireUrl('APP_BASE_URL');
}

for (const [name, value] of Object.entries(process.env)) {
  if (!value) continue;

  if (forbiddenCoreKeys.has(name)) {
    errors.push(`${name} must not be required by Lunavo core; use the self-hosted capability instead.`);
  }

  if (/^(FLUTTERWAVE_SECRET_KEY|FLW_SECRET_KEY|DATABASE_URL|SOCIAL_TOKEN_ENCRYPTION_KEY|SOCIAL_OAUTH_STATE_SECRET)$/.test(name)) {
    if (/^(changeme|replace_me|your_|test_|example)/i.test(value)) errors.push(`${name} contains a placeholder value.`);
  }
}

if (errors.length) {
  console.error('Lunavo production preflight: FAIL');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(strict ? 'Lunavo production preflight: PASS' : 'Lunavo production preflight: configuration shape OK');
