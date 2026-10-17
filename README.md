# Lunavo

Lunavo is a self-hosted, multi-merchant commerce operating system. The repository contains the merchant web application, API server, PostgreSQL schema and migrations, local AI/runtime gateways, and deployment configuration.

## Product boundaries

- PostgreSQL is the authoritative source for commerce, inventory, account, subscription and financial state.
- Flutterwave is the only external real-money payment rail. Leave its credentials unset during development; payment-dependent actions must stay unavailable until valid credentials are configured and provider verification is working.
- AI endpoints and model workers are self-hosted. Model output is advisory; it does not confirm payments, change the ledger, or override inventory and approval rules.
- Do not commit production credentials, live customer data, generated model weights, or deployment secrets.

## Prerequisites

- Node.js 24
- Corepack and pnpm 10.34.5
- Docker Engine with the Docker Compose plugin
- Enough memory and disk for the configured local model pack (model downloads can be large)

## Local setup

1. Copy `.env.example` to `.env`.
2. Set strong, unique values for `POSTGRES_PASSWORD` and `SESSION_SECRET`. Set `SOCIAL_GATEWAY_TOKEN` if you plan to enable social publishing integrations; without it, the local gateway remains disabled and core commerce can still start. Set `APP_BASE_URL` to the URL you will use to open Lunavo. Set `LUNAVO_MASTER_ADMIN_EMAIL` and choose a strong `LUNAVO_MASTER_ADMIN_PASSWORD` (at least 12 characters with uppercase, lowercase, a number, and a special character).
3. Review `LUNAVO_LOCAL_MODEL_PACK` and the model profile settings. The defaults are self-hosted examples; ensure your machine can serve the selected models.
4. Start the stack:

   ```sh
   docker compose up -d --build
   ```

   Local AI model downloads are an optional capability bootstrap: a failed or incomplete model pull must not prevent the core commerce application from starting. Check `docker compose logs ollama-init` if AI is degraded. To retry initialization after fixing network, storage, or model settings, run `docker compose run --rm ollama-init`. Choose `LUNAVO_LOCAL_MODEL_PACK` for the hardware you actually have; a model endpoint is not considered healthy just because the Ollama container is running.

   A self-hosted PostgreSQL backup worker runs independently of the app and writes validated, timestamped dumps to the `lunavo_backups` volume. Review its logs after startup; a running container alone is not proof of a fresh backup. See [backup and restore operations](docs/OPERATIONS_BACKUPS.md) for the recovery drill and off-host copy requirements.

5. Inspect service status and logs:

   ```sh
   docker compose ps
   docker compose logs -f lunavo
   ```

6. Check application health at `/healthz` and deployment readiness at `/readyz`. Readiness can report a degraded state when optional local AI, FX, social, or media workers are unavailable. Payment readiness remains false until both Flutterwave credentials are securely configured.

After the stack is healthy and database migrations have completed, provision the master administrator once with the isolated bootstrap profile:

   ```sh
   docker compose --profile bootstrap run --rm master-admin-bootstrap
   ```

   The bootstrap profile passes administrator credentials only to the one-shot bootstrap container, not the long-running web server. Do not run it as a routine restart command because it can reset the configured administrator credentials. Flutterwave credentials can remain blank until you configure them in Master Admin; real-money actions must remain unavailable until then.

## Development and verification

Install workspace dependencies with pnpm:

```sh
corepack enable
corepack prepare pnpm@10.34.5 --activate
pnpm install
```

Useful repository checks:

```sh
pnpm check:self-hosted
pnpm check:migrations
pnpm run typecheck
pnpm test
pnpm run build
```

`pnpm preflight:production` runs the strict production environment check, requiring database/session settings, an HTTPS app URL, and a master-admin identity. The API test command runs Vitest tests in `@workspace/api-server`.

## Architecture entry points

- `artifacts/ts-commerce/src` — merchant and shopper web surfaces
- `artifacts/api-server/src` — API server, authorization boundaries, routes and workers
- `lib/db` — PostgreSQL schema, migration runner and migrations
- `lib/platform-core` — shared platform policies
- `services/fx-gateway` — self-hosted FX ratebook gateway
- `services/social-gateway` — isolated social integration boundary
- `docs/LUNAVO_FEATURE_CATALOG.md` — expected product capabilities
- `docs/LUNAVO_IMPLEMENTATION_STATE.md` — implementation notes and release caveats
- `docs/OPERATIONS_BACKUPS.md` — self-hosted backup monitoring, retention, and restore drill
- `docs/PRODUCTION_LAUNCH_CHECKLIST.md` — self-hosted deployment, security, payments, AI, and recovery go/no-go checklist

A green test suite is necessary but not sufficient for a production launch. Verify deployment-specific database backups, secrets, TLS, domain routing, provider configuration, local model capacity, and restore procedures before accepting real orders.
