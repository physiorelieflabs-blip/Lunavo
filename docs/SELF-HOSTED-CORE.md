# Lunavo Self-Hosted Core Contract

This is an implementation rule, not a future aspiration.

## 1. Required external secret boundary

Lunavo core may require provider credentials only for real-money movement. The initial provider is Flutterwave:

- `FLUTTERWAVE_SECRET_KEY`
- `FLUTTERWAVE_WEBHOOK_SECRET`

These secrets stay server-side, are never bundled into the client, and are never committed to GitHub.

## 2. Everything else is API-independent by default

The following capabilities must run from Lunavo-owned code/data/services without a customer-supplied third-party API key:

- authentication and sessions
- authorization/RBAC/tenant isolation
- AI/copilot orchestration and deterministic business automation
- search, filtering and recommendations
- analytics and reporting
- media processing and local object-storage abstraction
- email notification/outbox logic
- SMS/push notification orchestration
- maps/address utilities
- currency/locale utilities and rate storage
- shipping rules and fulfillment orchestration
- workflow automation and background jobs
- audit logging and observability

External providers may be added as optional adapters when a feature genuinely depends on a platform that controls the destination (for example social publishing). Such adapters must never become a hidden requirement for the core product.

## 3. Self-hosted architecture

Every capability has a first-party interface and local implementation. Provider adapters sit behind the interface:

`Lunavo UI -> Lunavo API/domain service -> first-party capability -> optional adapter`

Never:

`Lunavo UI -> third-party API directly`

The first-party implementation remains the source of truth for records, permissions, billing state, automation state and audit history.

## 4. AI boundary

No OpenAI, Gemini, Anthropic or DeepSeek API key is required for Lunavo core. AI features must degrade gracefully to first-party deterministic tools and local/self-hosted model endpoints when a local model is deployed. AI output never becomes authoritative for money, inventory, permissions or payment verification.

## 5. Integration boundary

Optional integration credentials belong in the encrypted server-side integration store and are enabled per merchant/admin configuration. Their absence must not break unrelated Lunavo capabilities.

## 6. Enforcement

The platform-core provider policy and production preflight reject third-party AI/maps/messaging/search keys as core dependencies. This prevents future work from quietly reintroducing API-key requirements.

## 7. Quality bar

A feature is not complete when its screen exists. It is complete only when its server-side workflow, persistence, authorization, error states, idempotency, auditability and self-hosted fallback are implemented and verified.
