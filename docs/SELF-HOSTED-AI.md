# Lunavo self-hosted AI

Lunavo core AI uses model servers owned and operated by the deployment operator. The application does not require a hosted AI API key.

Configure either:

- `LUNAVO_LOCAL_LLM_URL` for one local OpenAI-compatible endpoint.
- `LUNAVO_LOCAL_LLM_POOL` for 1–4 local endpoints with `id`, `url`, `model`, optional `role`, and `weight`.

Supported roles are `primary`, `critic`, `vision`, and `coding`.

For high or maximum text reasoning, the gateway queries diverse text-capable local endpoints independently and then asks a configured local critic to review their candidates when one is present. Vision-tagged endpoints are excluded from text ensembles. A tagged pool with no compatible vision endpoint fails explicitly rather than silently sending image tasks to a tagged text-only model. If the critic/judge is unavailable, the highest-priority successful local candidate may be returned only for tasks whose configured safety policy permits that fallback; high-risk actions remain approval-gated.

### Collaboration contract

- Primary models decompose tasks and propose evidence-linked plans.
- Critic models check agreement, unsupported claims, uncertainty and policy constraints; the critic reviews candidates rather than becoming an authority over business state.
- Coding models may prepare structured plans/transforms but never receive arbitrary shell, SQL or unrestricted execution.
- Vision models only handle image requests when configured as vision-capable.
- Deterministic services own money, inventory, permissions, order/payment transitions, risk limits and policy decisions.
- Every model result must be schema-validated and grounded in the authorized records supplied to the task. When evidence or an integration is unavailable, report the limitation instead of manufacturing an answer or execution result.
- The ensemble is bounded by the configured pool (1–4 endpoints), task-specific fanout, response size and request timeout. The operator must evaluate actual model quality, latency and reliability on representative tasks rather than assume quality from model names.

Vision requests use a local multimodal-capable endpoint. Image generation is also local through `LUNAVO_LOCAL_IMAGE_URL`.

Model weights are intentionally not stored in this Git repository. The operator must deploy the selected open model weights and serving runtime on infrastructure they control.

AI output is never authoritative financial or inventory evidence. Payments, balances, payouts, stock, order status, provider verification, marketplace approval and other protected state remain server-side and database-controlled.
