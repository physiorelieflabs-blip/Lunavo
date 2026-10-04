# Lunavo total self-hosted architecture

Lunavo runs its core platform on infrastructure controlled by the deployment owner.

## External boundary

Flutterwave is the only external financial/payment rail intentionally supported by the Lunavo core.

## Self-hosted components

- PostgreSQL is authoritative for commerce, identity, ledger, workflow and audit state.
- Local authentication stores passwords with scrypt-derived hashes and manages sessions in PostgreSQL.
- Ollama/local OpenAI-compatible inference provides the multi-model AI fabric.
- Local embeddings use a self-hosted embedding runtime.
- Local image/video workers are selected only through private/local service URLs.
- FX uses a Lunavo-owned local ratebook. No public FX API is called by the core.
- Mail is written to Lunavo's local mail outbox; a deployment-owned MTA may consume that spool.
- Media/object storage uses the deployment-owned Lunavo data volume.
- Search remains database-native; no hosted search provider is required.
- Observability is local structured logging and admin diagnostics; no hosted analytics or tracing vendor is required.
- Social integrations are isolated behind the self-hosted social gateway. The gateway is the only component that talks to the social networks themselves.

## Fail-closed rules

When a self-hosted capability is unavailable, Lunavo fails closed for that capability. It does not silently fall back to a hosted AI, FX, mail, search, storage or analytics provider.

AI is advisory and bounded by server-side authorization. It cannot:

- confirm a payment;
- move money;
- change authoritative ledger entries;
- execute payouts;
- bypass merchant or admin approval;
- override inventory integrity;
- manufacture payment, settlement, stock or supplier facts.

## Required deployment secrets

Normal infrastructure requires PostgreSQL credentials, session/admin secrets, and local service configuration.

Flutterwave credentials are the only external financial credentials supported by the core:

- `FLUTTERWAVE_SECRET_KEY`
- `FLUTTERWAVE_WEBHOOK_SECRET`

Social OAuth application credentials, when those optional social networks are enabled, belong only in the separately deployed self-hosted social gateway and never in Lunavo core.

## FX ratebook

The self-hosted FX gateway reads `/data/lunavo/fx-rates.json`. Master Admin maintains rate pairs from the Integrations screen. Missing pairs produce an explicit error rather than a guessed rate.

The example ratebook intentionally contains no fabricated market values.
