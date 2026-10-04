# Lunavo self-hosted AI stack

Lunavo's AI layer is now a local multi-model intelligence fabric. The commerce application does not need hosted AI credentials.

## Recommended real local models

The default role map is:

- Fast operations: `qwen3:4b`
- General commerce reasoning: `qwen3:14b`
- Deep reasoning: `deepseek-r1:14b`
- Coding/developer work: `qwen3-coder:30b`
- Vision/image understanding: `gemma3:12b`
- Local review/critique: `qwen3:14b`
- Embeddings: `nomic-embed-text`

These are real open-weight model families available through local runtimes. The repository does not commit model weights and therefore does not pretend that a deployment has downloaded them.

Qwen3 is available in local Ollama variants including 4B, 14B, 30B and larger models. Qwen3-Coder 30B is a local coding model with long-context support. DeepSeek-R1 14B is a local reasoning model. Gemma 3 12B accepts text and images. See the official model references before selecting a model for a production machine.

## Release posture

The application fails closed when a local AI runtime is unavailable; it does not silently fall back to hosted AI providers.

## Multi-model behavior

Normal work is routed to the smallest suitable specialist. High-effort reasoning can use a local ensemble:

1. A reasoning model produces an analysis.
2. A general model provides an independent analysis.
3. A local review model arbitrates disagreements.
4. The final response is returned with contributor model identifiers.

The ensemble is deliberately tolerant of a failed specialist. It never fabricates a missing provider result.

## Security boundary

Local models cannot:

- mark a payment successful;
- create a bank destination;
- change an authoritative ledger entry;
- approve or execute a payout;
- mutate authoritative inventory outside existing server rules;
- bypass merchant permissions;
- turn creative text into factual evidence.

External integrations other than Flutterwave remain behind self-hosted adapter boundaries. Social provider OAuth credentials belong in the separately deployed self-hosted social gateway.

## Install the model pack

Linux/macOS:

`scripts/install-self-hosted-models.sh`

Windows PowerShell:

`scripts/install-self-hosted-models.ps1`

On constrained hardware, pull only the models that fit the machine and override the role-specific model environment variables. Never deploy the 480B/671B class models merely because they exist; their hardware requirements are substantially larger.
