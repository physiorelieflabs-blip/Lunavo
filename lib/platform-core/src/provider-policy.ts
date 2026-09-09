/**
 * Lunavo provider policy.
 *
 * Core product capabilities must run without customer-supplied third-party API
 * keys. External providers are adapters, not core dependencies. Flutterwave is
 * the current payment-rail exception because real money movement requires a
 * regulated payment provider.
 */

export type CapabilityKind =
  | 'auth'
  | 'ai'
  | 'search'
  | 'maps'
  | 'media'
  | 'email'
  | 'sms'
  | 'push'
  | 'analytics'
  | 'storage'
  | 'payments'
  | 'social'
  | 'fx'
  | 'shipping';

export type RuntimeMode = 'self-hosted' | 'adapter';

export type CapabilityPolicy = {
  kind: CapabilityKind;
  mode: RuntimeMode;
  providerKeysAllowed: boolean;
  notes: string;
};

const SELF_HOSTED = new Set<CapabilityKind>([
  'auth',
  'ai',
  'search',
  'maps',
  'media',
  'email',
  'sms',
  'push',
  'analytics',
  'storage',
  'fx',
  'shipping',
]);

export function getCapabilityPolicy(kind: CapabilityKind): CapabilityPolicy {
  if (kind === 'payments') {
    return {
      kind,
      mode: 'adapter',
      providerKeysAllowed: true,
      notes: 'TS Pay remains the source of truth; Flutterwave is the initial real-money rail.',
    };
  }

  if (SELF_HOSTED.has(kind)) {
    return {
      kind,
      mode: 'self-hosted',
      providerKeysAllowed: false,
      notes: 'Lunavo core must operate without a third-party API key for this capability.',
    };
  }

  return {
    kind,
    mode: 'self-hosted',
    providerKeysAllowed: false,
    notes: 'Default-deny external credentials; add a reviewed adapter only when explicitly required.',
  };
}

export const LUNAVO_REQUIRED_EXTERNAL_SECRETS = [
  'FLUTTERWAVE_SECRET_KEY',
  'FLUTTERWAVE_WEBHOOK_SECRET',
] as const;

export const LUNAVO_FORBIDDEN_CORE_API_KEYS = [
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
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
] as const;

export function isForbiddenCoreKey(name: string): boolean {
  return LUNAVO_FORBIDDEN_CORE_API_KEYS.includes(
    name as (typeof LUNAVO_FORBIDDEN_CORE_API_KEYS)[number],
  );
}
