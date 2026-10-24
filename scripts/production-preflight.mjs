#!/usr/bin/env node
import { isIP } from 'node:net';

try {
  process.loadEnvFile?.('.env');
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

const strict = process.argv.includes('--strict');
const publicDeploy = process.argv.includes('--public-deploy');
const liveMoney = process.argv.includes('--live-money');
const errors = [];
const warnings = [];
const testMode = process.env.NODE_ENV !== 'production' &&
  process.env.LUNAVO_PREFLIGHT_TEST_MODE === '1';

if (process.env.NODE_ENV === 'production' && process.env.LUNAVO_PREFLIGHT_TEST_MODE === '1') {
  errors.push('LUNAVO_PREFLIGHT_TEST_MODE is forbidden when NODE_ENV=production.');
}
function requireEnv(name) {
  if (!process.env[name]?.trim()) errors.push(name + ' is required for production.');
}
function isPlaceholder(value) {
  return /^(?:change[-_ ]?me|replace[-_ ]?me|your[-_ ]|example(?:[-_ ].*)?|test[-_ ].*|ci[-_ ].*|dummy|placeholder|changethis|secret|password)$/i.test(value.trim());
}
function checkSecret(name, value, minLength = 32) {
  if (!value) return;
  if (!testMode && (value.length < minLength || isPlaceholder(value) || /^(.)\1{15,}$/.test(value))) {
    errors.push(name + ' is too short or looks like a placeholder/weak secret; generate a fresh random value.');
  }
}
function parseHttpsUrl(name, value) {
  if (!value) { errors.push(name + ' is required for production.'); return null; }
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:') errors.push(name + ' must use HTTPS.');
    if (parsed.username || parsed.password) errors.push(name + ' must not contain URL credentials.');
    if (parsed.search || parsed.hash || (parsed.pathname !== '/' && parsed.pathname !== '')) {
      errors.push(name + ' must be the site origin only (no path, query, or fragment).');
    }
    return parsed;
  } catch {
    errors.push(name + ' must be a valid absolute HTTPS URL.');
    return null;
  }
}
function checkPublicDomain(domain) {
  const value = (domain || '').trim().toLowerCase();
  if (!value) { errors.push('LUNAVO_DOMAIN is required for production.'); return null; }
  if (value.includes('://') || value.includes('/') || value.includes(':') || value.endsWith('.')) {
    errors.push('LUNAVO_DOMAIN must be a hostname only (no scheme, path, port, or trailing dot).');
    return null;
  }
  let parsed;
  try { parsed = new URL('https://' + value); }
  catch { errors.push('LUNAVO_DOMAIN is not a valid hostname.'); return null; }
  const host = parsed.hostname.toLowerCase();
  if (host !== value || !host.includes('.') || isIP(host) || !/^[a-z0-9.-]+$/.test(host)) {
    errors.push('LUNAVO_DOMAIN must be a public DNS hostname, not an IP address or local name.');
    return null;
  }
  if (!testMode && (host === 'localhost' || /\.(?:invalid|example|test|localhost|local|internal)$/.test(host) ||
      ['example.com','example.net','example.org','your-lunavo-domain.example'].includes(host))) {
    errors.push('LUNAVO_DOMAIN still uses a reserved or placeholder hostname. Set a real domain you control.');
  }
  return parsed;
}

if (strict) {
  for (const name of ['POSTGRES_PASSWORD','DATABASE_URL','SESSION_SECRET','APP_BASE_URL','LUNAVO_DOMAIN']) requireEnv(name);
  if (!process.env.LUNAVO_MASTER_ADMIN_EMAIL && !process.env.LUNAVO_MASTER_ADMIN_USER_ID) {
    errors.push('LUNAVO_MASTER_ADMIN_EMAIL or LUNAVO_MASTER_ADMIN_USER_ID is required for production.');
  }
  checkSecret('POSTGRES_PASSWORD', process.env.POSTGRES_PASSWORD, 32);
  checkSecret('SESSION_SECRET', process.env.SESSION_SECRET, 32);
  if (process.env.POSTGRES_PASSWORD && process.env.SESSION_SECRET &&
      process.env.POSTGRES_PASSWORD === process.env.SESSION_SECRET) {
    errors.push('POSTGRES_PASSWORD and SESSION_SECRET must be different independent secrets.');
  }
  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl) {
    try {
      const parsed = new URL(dbUrl);
      if (!['postgres:','postgresql:'].includes(parsed.protocol)) errors.push('DATABASE_URL must use postgres:// or postgresql://.');
      if (!parsed.username || !parsed.password || !parsed.hostname) errors.push('DATABASE_URL must include a database hostname, username, and password.');
      if (!testMode && parsed.password !== process.env.POSTGRES_PASSWORD) {
        errors.push('DATABASE_URL password must match POSTGRES_PASSWORD for the Compose PostgreSQL service.');
      }
      if (!testMode && (parsed.hostname !== 'postgres' || parsed.pathname !== '/lunavo')) {
        errors.push('DATABASE_URL must target the Compose PostgreSQL service postgres:5432/lunavo.');
      }
    } catch { errors.push('DATABASE_URL must be a valid PostgreSQL connection URL.'); }
  }
  const base = parseHttpsUrl('APP_BASE_URL', process.env.APP_BASE_URL);
  const domain = checkPublicDomain(process.env.LUNAVO_DOMAIN);
  if (base && domain && base.hostname.toLowerCase() !== domain.hostname.toLowerCase()) {
    errors.push('APP_BASE_URL hostname must exactly match LUNAVO_DOMAIN.');
  }
  if (process.env.LUNAVO_MASTER_ADMIN_EMAIL &&
      !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(process.env.LUNAVO_MASTER_ADMIN_EMAIL.trim())) {
    errors.push('LUNAVO_MASTER_ADMIN_EMAIL must be a valid email address.');
  }
}

const forbiddenCoreKeys = new Set([
  'OPENAI_API_KEY','GEMINI_API_KEY','ANTHROPIC_API_KEY','DEEPSEEK_API_KEY',
  'GOOGLE_MAPS_API_KEY','MAPBOX_ACCESS_TOKEN','TWILIO_AUTH_TOKEN','SENDGRID_API_KEY',
  'MAILGUN_API_KEY','RESEND_API_KEY','ALGOLIA_API_KEY','PINECONE_API_KEY',
  'AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY','CLERK_SECRET_KEY','CLERK_PUBLISHABLE_KEY',
  'SOCIAL_META_CLIENT_ID','SOCIAL_META_CLIENT_SECRET','SOCIAL_TIKTOK_CLIENT_KEY',
  'SOCIAL_TIKTOK_CLIENT_SECRET','SOCIAL_GOOGLE_CLIENT_ID','SOCIAL_GOOGLE_CLIENT_SECRET',
  'SOCIAL_LINKEDIN_CLIENT_ID','SOCIAL_LINKEDIN_CLIENT_SECRET','SOCIAL_PINTEREST_CLIENT_ID',
  'SOCIAL_PINTEREST_CLIENT_SECRET','SOCIAL_X_CLIENT_ID','SOCIAL_X_CLIENT_SECRET',
  'LUNAVO_MASTER_ADMIN_SETUP_TOKEN'
]);
for (const [name,value] of Object.entries(process.env)) {
  if (!value) continue;
  if (forbiddenCoreKeys.has(name)) errors.push(name + ' must not be required by Lunavo core; use the self-hosted capability boundary instead.');
  if (/^(FLUTTERWAVE_SECRET_KEY|FLW_SECRET_KEY|FLUTTERWAVE_WEBHOOK_SECRET|FLW_WEBHOOK_HASH|DATABASE_URL|SESSION_SECRET|LUNAVO_MASTER_ADMIN_SETUP_TOKEN)$/.test(name) &&
      /^(changeme|replace_me|your_|test_|example|ci-only)/i.test(value) && !testMode) {
    errors.push(name + ' contains a placeholder value.');
  }
}
if (liveMoney) {
  if (!process.env.FLUTTERWAVE_SECRET_KEY && !process.env.FLW_SECRET_KEY) errors.push('--live-money requires Flutterwave Secret Key to be supplied to the preflight.');
  if (!process.env.FLUTTERWAVE_WEBHOOK_SECRET && !process.env.FLW_WEBHOOK_HASH) errors.push('--live-money requires Flutterwave Webhook Secret to be supplied to the preflight.');
  for (const name of ['FLUTTERWAVE_SECRET_KEY','FLW_SECRET_KEY','FLUTTERWAVE_WEBHOOK_SECRET','FLW_WEBHOOK_HASH']) {
    if (process.env[name] && isPlaceholder(process.env[name])) errors.push(name + ' is not a usable provider credential.');
  }
}
if (strict && !process.env.FLUTTERWAVE_SECRET_KEY && !process.env.FLW_SECRET_KEY) warnings.push('Flutterwave Secret Key is not supplied to this preflight; keep real-money actions disabled until valid credentials are verified in Master Admin.');
if (strict && !process.env.FLUTTERWAVE_WEBHOOK_SECRET && !process.env.FLW_WEBHOOK_HASH) warnings.push('Flutterwave webhook secret is not supplied to this preflight; provider webhook settlement must stay disabled until configured and verified.');
if (strict && !process.env.LUNAVO_LOCAL_LLM_URL) warnings.push('Self-hosted AI endpoint is not explicitly set in the environment; verify the model endpoint before enabling AI-dependent features.');
if (strict && !process.env.LUNAVO_LOCAL_FX_URL) warnings.push('Self-hosted FX gateway is not explicitly set in the environment; verify fresh exchange rates before enabling cross-currency quoting.');
if (process.env.FX_UPSTREAM_URL) errors.push('FX_UPSTREAM_URL is forbidden; FX must use the self-hosted local ratebook.');
if (process.env.SMTP_HOST || process.env.SMTP_USER || process.env.SMTP_PASSWORD || process.env.SMTP_PORT) {
  errors.push('Remote SMTP configuration is forbidden in Lunavo core; use the self-hosted mail outbox/MTA boundary.');
}
if (errors.length) {
  console.error('Lunavo production preflight: FAIL');
  for (const error of errors) console.error('- ' + error);
  process.exit(1);
}
for (const warning of warnings) console.warn('- ' + warning);
console.log(strict ? 'Lunavo production preflight: PASS' : 'Lunavo production preflight: configuration shape OK');
