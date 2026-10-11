# Lunavo

Lunavo is a self-hostable commerce and dropshipping platform. This repository contains the merchant web app, API server, PostgreSQL schema and migrations, local AI gateway, supplier sourcing/imports, pricing and inventory controls, checkout/payment processing, fulfillment, merchant operations, analytics, marketplace/auction flows and workflow automation.

GitHub is the source of truth. The core application uses PostgreSQL and local/first-party services. Flutterwave is the supported external provider for real-money checkout. Optional social-network publishing adapters may require separate platform credentials and approvals, but they are not required to start the core app.

## Quick start: local Docker deployment

Prerequisites: Docker Engine with the Docker Compose v2 plugin, Git, and enough disk space for PostgreSQL and the containers. The core service starts without downloaded AI weights or payment credentials.

1. Clone the repository and enter its directory.
2. Copy .env.example to .env.
3. Set a unique POSTGRES_PASSWORD and SESSION_SECRET. For local HTTP development, set NODE_ENV=development and APP_BASE_URL=http://localhost:5000. For production, use NODE_ENV=production, set APP_BASE_URL to the real public HTTPS URL, and terminate TLS through a reverse proxy or load balancer.
4. Set LUNAVO_MASTER_ADMIN_EMAIL and LUNAVO_MASTER_ADMIN_USERNAME. Do not save the one-time Master Admin password in .env or in Git.
5. Start the app:

~~~sh
docker compose up -d --build
docker compose logs -f lunavo
~~~

6. Wait for database migrations to finish. Confirm http://localhost:5000/healthz and http://localhost:5000/readyz, then bootstrap the first Master Admin. Provide the password only for this command:

~~~sh
export LUNAVO_MASTER_ADMIN_PASSWORD='Use-A-Unique-Long-Password-2026!'
docker compose run --rm -e LUNAVO_MASTER_ADMIN_PASSWORD lunavo node --experimental-strip-types artifacts/api-server/src/bootstrap-master-admin.ts
unset LUNAVO_MASTER_ADMIN_PASSWORD
~~~

Use a unique password that meets the script's complexity requirements. Open http://localhost:5000 for local development or your HTTPS domain in production. Enable Master Admin MFA after signing in.

The .env file is not for source control. Back up required secrets separately from database backups. Changing the PostgreSQL password in .env after the database volume already exists does not automatically change the database user's existing password.

## Enable the self-hosted text-and-vision ensemble

The default Compose file does not download model weights. To start the optional Ollama-based ensemble, run:

~~~sh
docker compose -f docker-compose.yml -f docker-compose.ai.yml up -d --build
docker compose -f docker-compose.yml -f docker-compose.ai.yml logs -f ollama-model-init
~~~

On first startup, the overlay downloads a primary reasoner, critic, coding model and vision model (about 17 GB of model files plus runtime/RAM/disk overhead). Ollama is accessible only on the private Docker network; do not expose it publicly. The defaults are a starter profile, not a claim of universally best quality. Confirm your hardware can run the selected models, and review their licenses and performance for your intended use. The app can run without the overlay, but AI features remain unavailable until a compatible local inference endpoint is configured.

Image generation is separate. Configure LUNAVO_LOCAL_IMAGE_URL to a trusted, self-hosted image-generation service that supports the documented response format. The Ollama text/vision overlay does not provide image synthesis. Lunavo validates generated image formats and response sizes and never falls back to a hosted image API.

See docs/SELF-HOSTED-AI.md and docs/SELF-HOSTED-CORE.md.

## Enable real-money checkout

Real payment checkout remains unavailable until both Flutterwave credentials are configured. Sign in as Master Admin, open Admin → Integrations, and configure the Secret API Key and Webhook Secret. Credentials are encrypted at rest and are not revealed back to the browser. Use a public HTTPS deployment and configure the correct provider webhook URL before opening checkout to customers.

Credentials alone do not prove that a payment succeeded. Lunavo verifies provider transaction status and amount/currency before changing order or ledger state. Internal TS Pay identifiers are not bank destinations.

## Useful commands

~~~sh
# Rebuild / start core app
docker compose up -d --build

# Check services and logs
docker compose ps
docker compose logs --tail=200 lunavo

# Run repository checks locally (Node 24 and pnpm required)
pnpm install --frozen-lockfile
pnpm run check:self-hosted
pnpm run preflight:production
pnpm run test
pnpm run typecheck
pnpm run build
~~~

CI also checks Compose configuration, PostgreSQL migration smoke tests, implementation invariants, payment/security simulations, unit tests, typecheck and build.

## Persistence, backup and restore

PostgreSQL is stored in the named lunavo_postgres volume; uploaded/local object data uses lunavo_data. Back up both according to your retention requirements, store backups off-host, and test restoring them periodically.

Example logical database backup:

~~~sh
docker compose exec -T postgres pg_dump -U lunavo lunavo > lunavo-db-$(date +%F).sql
~~~

Do not expose PostgreSQL publicly. Restrict access to the host, .env, backups and model services. A production deployment should include TLS, strong secrets, updates, monitoring, off-host backups and a tested restore procedure.

## Connected-commerce implementation notes

The Connected Commerce Blueprint in docs/LUNAVO_CONNECTED_COMMERCE_BLUEPRINT.md is the cross-module target and audit checklist. A feature should be treated as shipped only when its UI, API, authorization, database changes, worker/provider, recovery behavior, audit trail and tests exist.

A public supplier product page is not a supplier API. Where no supported supplier ordering adapter exists, an order must go through an explicit merchant-assisted workflow instead of being reported as auto-ordered. Source evidence, source costs, inventory freshness, pricing constraints, verified payments, and shipment/tracking evidence must remain distinct.

## Configuration boundaries

- Real-money payments require Flutterwave Secret API Key and Webhook Secret configuration.
- Local AI requires compatible model-serving infrastructure; the optional Ollama profile enables text reasoning and vision but not image generation.
- Publishing to third-party social networks and programmatically ordering from external suppliers require supported adapters and platform authorization. Without those, Lunavo should stay in draft or assisted mode.
- FX conversion uses locally stored, source-dated official observations and fails closed when rates are stale or unavailable. Reference rates are not executable payment or settlement quotes.
- Passing CI proves the tested code and simulations pass. It does not replace a deployment smoke test with your own domain, provider settings, hardware, supplier accounts, backups and restore procedure.
