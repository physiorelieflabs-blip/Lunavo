# Lunavo self-hosted AI

Lunavo core AI uses model servers owned and operated by the deployment operator. The application does not require a hosted AI API key.

Configure either:

- `LUNAVO_LOCAL_LLM_URL` for one local OpenAI-compatible endpoint.
- `LUNAVO_LOCAL_LLM_POOL` for 1–4 local endpoints with `id`, `url`, `model`, optional `role`, and `weight`.

## Docker deployment without hosted AI keys

The default `docker-compose.yml` passes the local model, embedding, search, and image endpoint settings into the API container. It does not pretend AI is online when no local endpoint is configured.

For a ready-made, self-hosted text-and-vision ensemble, run:

```sh
docker compose -f docker-compose.yml -f docker-compose.ai.yml up -d
```

The optional overlay starts a private Ollama service, downloads four model roles to a persistent Docker volume, and supplies `LUNAVO_LOCAL_LLM_POOL` automatically:

- Primary reasoning: `qwen2.5:7b`
- Independent critic: `mistral:7b`
- Coding/structured tasks: `qwen2.5-coder:7b`
- Product-image understanding: `qwen2.5vl:3b`

On first launch, expect roughly 17 GB of model downloads plus runtime memory and disk overhead. Ollama is not published on a public host port; only Lunavo can access it on the private Compose network. The bundle limits model residency and parallelism to reduce memory pressure. This improves compatibility on modest machines but may queue multiple-model requests and be slow without suitable CPU/GPU resources.

The default models are a working deployment profile, not a claim that they are universally the highest-performing models. Operators should benchmark task quality, latency, hardware use and licenses before production use. To choose a different ensemble, customize the pool and model-pull commands in `docker-compose.ai.yml` together so model names and endpoint roles remain aligned.

The default `docker-compose.yml` is still suitable for deployments that run their own local model endpoints. Set `LUNAVO_LOCAL_LLM_POOL` or `LUNAVO_LOCAL_LLM_URL` in the deployment environment and restart the API after changing environment configuration.

### Local image generation

The Ollama bundle enables text reasoning and vision, not image synthesis. Image generation uses the separate first-party adapter configured by `LUNAVO_LOCAL_IMAGE_URL`, with `LUNAVO_LOCAL_IMAGE_MODEL` and `LUNAVO_LOCAL_IMAGE_SIZE`. Point it at an image-generation server that is operated on the same trusted private network and implements the OpenAI-compatible image-generation response shape or one of the supported embedded-image response fields. Do not expose a model service publicly without access controls. Image generation stays unavailable when that endpoint is absent; the application must never fall back to a hosted image provider.

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
