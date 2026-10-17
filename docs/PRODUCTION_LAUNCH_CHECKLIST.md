# Lunavo production launch checklist

This is the operator hand-off for a **self-hosted** deployment. A passing build verifies code and packaging; it does not prove that a domain, TLS certificate, payment account, model server, email delivery, or disaster-recovery destination is configured. Complete these checks before accepting live customer orders.

## 1. Pin and verify the release

- [ ] Deploy from the reviewed `feat/lunavo-master-implementation` commit, not from an unreviewed feature branch.
- [ ] Confirm GitHub Actions is green for the exact release candidate: migration consistency and PostgreSQL smoke test, self-hosted policy, repository secret scan, financial boundary audit, payment/subscription simulation, unit tests, TypeScript check, app build, and production container-image builds.
- [ ] Keep production changes in Git; never hot-edit files inside the running container.

## 2. Prepare the host and HTTPS entry point

- [ ] Use a host with Docker Engine and the Docker Compose plugin. Reserve sufficient storage for PostgreSQL, uploads, backups, logs, and the selected local model pack.
- [ ] Point a domain you control at this host and set up your own HTTPS reverse proxy/TLS termination. Set `APP_BASE_URL` to the final **HTTPS** URL.
- [ ] The Compose stack publishes Lunavo on host loopback at `127.0.0.1:5000` by default. Point a host-level reverse proxy to `127.0.0.1:5000`; do not open port 5000 directly to the public internet. If your reverse proxy is containerized, use an explicitly shared Docker network and route to the `lunavo:5000` service instead of relying on one container's loopback.
- [ ] Permit only the public ports needed by your reverse proxy and firewall direct access to PostgreSQL, Ollama, the FX gateway, and the social gateway.

## 3. Create private environment secrets

1. Copy the template and restrict access:

   ```sh
   cp .env.example .env
   chmod 600 .env
   ```

2. Generate unique high-entropy values on the server. For the PostgreSQL password, use hex characters so it can be placed safely in the PostgreSQL connection URL:

   ```sh
   openssl rand -hex 32
   openssl rand -hex 32
   openssl rand -hex 32
   ```

   Use separate values for `POSTGRES_PASSWORD` and `SESSION_SECRET`; do not reuse a secret across purposes. If you enable the social gateway, use the third random value for `SOCIAL_GATEWAY_TOKEN`. Without this token, the gateway returns a clear disabled response and the commerce service still starts. Do not paste generated secrets into source control or share them in tickets.

3. Set at least `POSTGRES_PASSWORD`, `SESSION_SECRET`, `SOCIAL_GATEWAY_TOKEN`, `APP_BASE_URL`, `DATABASE_URL`, `LUNAVO_MASTER_ADMIN_EMAIL`, `LUNAVO_MASTER_ADMIN_USERNAME`, and a strong `LUNAVO_MASTER_ADMIN_PASSWORD` in `.env`. The connection URL should use the internal Compose database host, for example `postgres://lunavo:YOUR_HEX_PASSWORD@postgres:5432/lunavo`. Compose constructs the running app's database URL from `POSTGRES_PASSWORD`; the root `DATABASE_URL` is also used by the strict preflight check.
4. Never commit `.env`. After the one-time master-admin bootstrap succeeds, clear `LUNAVO_MASTER_ADMIN_PASSWORD` from `.env` and store the recovery information securely. Do not rerun the bootstrap command during routine restarts because it may reset the administrator credentials.

## 4. Configure local intelligence deliberately

- [ ] Review `LUNAVO_LOCAL_MODEL_PACK` against the CPU/RAM/GPU/disk capacity of this host. Pulling multiple models can require substantial storage and memory; choose a smaller pack if the host cannot serve them reliably.
- [ ] Keep configured default model names represented in the model pack, or explicitly point a profile at a separately managed local model endpoint. The CI policy check verifies that the sample profile defaults and sample pack remain consistent.
- [ ] Start with the local model endpoints in the Compose stack. Check `docker compose logs --tail=200 ollama-init` for download failures and test a real inference request in Lunavo's AI surface. Ollama being “started” is not proof that a model is downloaded or inference-ready.
- [ ] The core commerce service is designed to start in a degraded mode when optional local AI is unavailable. Do not describe AI features as active until model inference has actually been tested.
- [ ] Verify the self-hosted FX ratebook/gateway is returning fresh rates before enabling cross-currency quoting or settlement decisions.
- [ ] Configure any local image/video workers you plan to use. If a specialist is not configured, treat its features as unavailable rather than assuming the placeholder model name is a real worker.

## 5. Build, start, and check readiness

From the repository root:

```sh
corepack enable
corepack prepare pnpm@10.34.5 --activate
pnpm install --frozen-lockfile
pnpm check:migrations
pnpm check:self-hosted
pnpm run typecheck
pnpm run test
pnpm run build
pnpm preflight:production
docker compose config --quiet
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 lunavo postgres postgres-backup ollama-init social-gateway fx-gateway
```

Then verify `/healthz` and `/readyz` locally and through your HTTPS domain. Readiness can report degraded optional capabilities; understand the reported reason rather than ignoring it. Verify startup migrations completed before provisioning the master administrator.

## 6. Provision the administrator and test access boundaries

- [ ] Run the isolated one-time admin bootstrap only after the app is healthy:

  ```sh
  docker compose --profile bootstrap run --rm master-admin-bootstrap
  ```

- [ ] Sign in through HTTPS, configure the supported Master Admin security/MFA settings, and verify recovery access.
- [ ] Create at least two test merchants and prove each can access only its own store, products, orders, customer records, payment records, and reports.
- [ ] Verify merchant-team roles and location scopes; do not rely on UI hiding instead of server permission checks.
- [ ] Verify signup works before full verification, while the payout path remains gated by the required full verification/KYC controls.

## 7. Configure Flutterwave—the only external real-money rail

- [ ] Keep production payment actions disabled until a valid Flutterwave secret key and webhook secret/hash are configured in Master Admin's Integrations & Runtime control surface.
- [ ] Configure Flutterwave to call the exact webhook URL shown by Lunavo's configured deployment. Protect the key and webhook secret; verify the values are masked and never returned to ordinary API responses or logs.
- [ ] Use your provider's test/sandbox credentials and transactions first where supported. Confirm server-side transaction re-query, webhook signature validation, replay/idempotency handling, currency/amount matching, and settlement reconciliation.
- [ ] Verify that the ledger records sale, provider fee (when returned), and Lunavo's 1% platform fee as distinct entries. Test duplicate webhook delivery, payment failure, late payment, refund, subscription renewal/cancellation, and manual withdrawal review.
- [ ] Confirm that discount reservations are redeemed once only after provider-verified payment; a client event alone must never redeem a discount.
- [ ] Do not accept live orders until the test transactions and financial reports reconcile to the provider. Leave the Flutterwave fields blank if this test cannot be completed; payment-dependent actions should remain unavailable.

## 8. Test the connected commerce loop

- [ ] Import a supplier product from a public URL, review extracted versus generated fields, and test the duplicate decision flow. Confirm a loopback/private-network supplier URL is rejected.
- [ ] Edit a product, accept a supplier refresh, and run a supplier sync. Confirm committed changes create durable events and that price/currency/stock guardrails require review when applicable.
- [ ] Configure an automation in dry-run or approval mode first. Check its runs and dead-letter state before enabling any safe automatic action.
- [ ] Create a test checkout and confirm the paid order, stock reservation/commit, promotion redemption, TS Pay ledger entries, and fulfilment task agree. Repeat the provider webhook to prove idempotency.
- [ ] Confirm that fulfilment status events represent Lunavo's **internal task status**. Do not infer that the external supplier placed, accepted, shipped, or delivered an order unless a configured supplier adapter/provider actually confirmed that action.
- [ ] Verify refund and withdrawal review, tax/shipping configuration, storefront publication/custom-domain routing, analytics, and required customer notifications.
- [ ] Confirm that notifications which need email delivery have a configured self-hosted mail/outbox delivery path; a stored notification or queued message alone does not prove email was delivered.

## 9. Backup and recovery gate

- [ ] Inspect `docker compose logs --tail=200 postgres-backup` and confirm the worker has written a fresh, timestamped, validated dump to the `lunavo_backups` volume.
- [ ] Follow [Backup and restore operations](OPERATIONS_BACKUPS.md) to validate an archive and restore it into a separate scratch database without modifying production.
- [ ] Configure an encrypted backup copy on an **independent system you control**, with keys stored separately from the backup. Same-host Docker volumes do not protect against host loss or ransomware.
- [ ] Document who can restore, how secrets and encryption keys are recovered, the acceptable recovery-point objective (data loss) and recovery-time objective (downtime). Repeat a restore drill on a schedule.

## 10. Final go/no-go

Launch only when the exact code revision has green CI; HTTPS and firewall controls are proven; administrator recovery is tested; Flutterwave settlement and ledger reconciliation have passed; local models/FX have been tested for every capability being enabled; backups have an independent copy and a successful restore drill; and tenant-isolation/permission checks pass.

A green CI run does not supply a domain, TLS certificate, provider account, OAuth credentials, server capacity, external supplier purchasing capability, or independent disaster-recovery storage. Those are deployment-specific prerequisites—not features to pretend are automatically ready.
