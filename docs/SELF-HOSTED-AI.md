# Lunavo self-hosted AI

Lunavo core AI uses model servers owned and operated by the deployment operator. The application does not require a hosted AI API key.

Configure either:

- `LUNAVO_LOCAL_LLM_URL` for one local OpenAI-compatible endpoint.
- `LUNAVO_LOCAL_LLM_POOL` for 1–4 local endpoints with `id`, `url`, `model`, optional `role`, and `weight`.

Supported roles are `primary`, `critic`, `vision`, and `coding`.

For high or maximum reasoning, the gateway can query multiple local endpoints independently and then use a local endpoint as a judge. A failed judge never creates a fabricated answer; the highest-priority successful local result is retained.

Vision requests use a local multimodal-capable endpoint. Image generation is also local through `LUNAVO_LOCAL_IMAGE_URL`.

Model weights are intentionally not stored in this Git repository. The operator must deploy the selected open model weights and serving runtime on infrastructure they control.

AI output is never authoritative financial or inventory evidence. Payments, balances, payouts, stock, order status, provider verification, marketplace approval and other protected state remain server-side and database-controlled.
