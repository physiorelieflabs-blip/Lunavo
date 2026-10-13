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
2. Set a strong, unique `POSTGRES_PASSWORD` and `SESSION_SECRET`. Set `APP_BASE_URL` to the URL you will use to open Lunavo.
3. Review `LUNAVO_LOCAL_MODEL_PACK` and the model profile settings. The defaults are self-hosted examples; ensure your machine can serve the selected models.
4. Start the stack:

   ```sh
   docker compose up -d --build
   ```

5. Inspect service status and logs:

   ```sh
   docker compose ps
   docker compose logs -f lunavo
   ```

6. Check application health at `/healthz` and deployment readiness at `/readyz`. Readiness can report a degraded state when optional local AI, FX, social, or media workers are unavailable. Payment readiness remains false until both Flutterwave credentials are securely configured.

The master administrator is provisioned with the API package's one-time `bootstrap:master-admin` command after the database schema has been initialized. Configure `LUNAVO_MASTER_ADMIN_EMAIL`, `LUNAVO_MASTER_ADMIN_USERNAME`, and a strong `LUNAVO_MASTER_ADMIN_PASSWORD` in the deployment environment before running that command. Do not run it as a routine restart command because its current behavior can reset the configured administrator credentials.

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

`pnpm preflight:production` checks production environment shape; `pnpm preflight:production -- --strict` also requires production URL and secret configuration. The API test command runs Vitest tests in `@workspace/api-server`.

## Architecture entry points

- `artifacts/ts-commerce/src` — merchant and shopper web surfaces
- `artifacts/api-server/src` — API server, authorization boundaries, routes and workers
- `lib/db` — PostgreSQL schema, migration runner and migrations
- `lib/platform-core` — shared platform policies
- `services/fx-gateway` — self-hosted FX ratebook gateway
- `services/social-gateway` — isolated social integration boundary
- `docs/LUNAVO_FEATURE_CATALOG.md` — expected product capabilities
- `docs/LUNAVO_IMPLEMENTATION_STATE.md` — implementation notes and release caveats

A green test suite is necessary but not sufficient for a production launch. Verify deployment-specific database backups, secrets, TLS, domain routing, provider configuration, local model capacity, and restore procedures before accepting real orders.
