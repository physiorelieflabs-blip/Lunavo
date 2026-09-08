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

if (strict) {
  requireEnv('DATABASE_URL');
  requireEnv('CLERK_SECRET_KEY');
  requireEnv('CLERK_PUBLISHABLE_KEY');
  requireAnyEnv('FLUTTERWAVE_SECRET_KEY', 'FLW_SECRET_KEY');
  requireAnyEnv('FLUTTERWAVE_WEBHOOK_SECRET', 'FLW_WEBHOOK_HASH');
  requireUrl('APP_BASE_URL');
}

for (const [name, value] of Object.entries(process.env)) {
  if (!value) continue;
  if (/^(FLUTTERWAVE_SECRET_KEY|FLW_SECRET_KEY|CLERK_SECRET_KEY|DATABASE_URL|SOCIAL_TOKEN_ENCRYPTION_KEY|SOCIAL_OAUTH_STATE_SECRET)$/.test(name)) {
    if (/^(changeme|replace_me|your_|test_|example)/i.test(value)) errors.push(`${name} contains a placeholder value.`);
  }
}

if (errors.length) {
  console.error('Lunavo production preflight: FAIL');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(strict ? 'Lunavo production preflight: PASS' : 'Lunavo production preflight: configuration shape OK');
