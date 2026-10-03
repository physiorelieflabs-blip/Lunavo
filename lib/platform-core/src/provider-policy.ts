/** Self-hosted provider policy for Lunavo. Flutterwave is the only external rail and is optional until configured. */
export type CapabilityKind='auth'|'ai'|'search'|'maps'|'media'|'email'|'sms'|'push'|'analytics'|'storage'|'payments'|'social'|'fx'|'shipping';
export type RuntimeMode='self-hosted'|'adapter';
export type CapabilityPolicy={kind:CapabilityKind;mode:RuntimeMode;providerKeysAllowed:boolean;notes:string};
const SELF_HOSTED=new Set<CapabilityKind>(['auth','ai','search','maps','media','email','sms','push','analytics','storage','fx','shipping']);
export function getCapabilityPolicy(kind:CapabilityKind):CapabilityPolicy{if(kind==='payments')return{kind,mode:'adapter',providerKeysAllowed:true,notes:'TS Pay is first-party ledger/control plane; Flutterwave is an optional real-money adapter.'};if(SELF_HOSTED.has(kind))return{kind,mode:'self-hosted',providerKeysAllowed:false,notes:'Lunavo core must operate without a third-party API key for this capability.'};return{kind,mode:'self-hosted',providerKeysAllowed:false,notes:'External credentials are default-deny and never required by core.'};}
export const LUNAVO_REQUIRED_EXTERNAL_SECRETS=[] as const;
export const LUNAVO_OPTIONAL_EXTERNAL_SECRETS=['FLUTTERWAVE_SECRET_KEY','FLUTTERWAVE_WEBHOOK_SECRET'] as const;
export const LUNAVO_FORBIDDEN_CORE_API_KEYS=['OPENAI_API_KEY','GEMINI_API_KEY','ANTHROPIC_API_KEY','DEEPSEEK_API_KEY','GOOGLE_MAPS_API_KEY','MAPBOX_ACCESS_TOKEN','TWILIO_AUTH_TOKEN','SENDGRID_API_KEY','MAILGUN_API_KEY','RESEND_API_KEY','ALGOLIA_API_KEY','PINECONE_API_KEY','AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY','CLERK_SECRET_KEY','CLERK_PUBLISHABLE_KEY'] as const;
export function isForbiddenCoreKey(name:string){return LUNAVO_FORBIDDEN_CORE_API_KEYS.includes(name as (typeof LUNAVO_FORBIDDEN_CORE_API_KEYS)[number]);}
