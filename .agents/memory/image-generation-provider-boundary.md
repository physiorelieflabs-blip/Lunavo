---
name: Image generation provider boundary
description: Provider selection, prompt fidelity, response validation, and quota-aware fallback for merchant image generation.
---

Use configured image providers in a quota-aware chain, preserve the merchant's prompt as the source of truth, and validate that every provider response is a supported non-empty image before storing it. Provider failures must be actionable but must never expose credentials or save arbitrary provider responses as media.

**Why:** Image generation providers can be configured but unavailable because of quota, credits, authentication, or response-shape failures. A single public provider also tended to rewrite prompts or fail silently.

**How to apply:** Keep provider-specific calls behind one server-side generator, prefer configured authenticated providers, retain a prompt-faithful fallback for availability, and validate MIME type and bytes before returning the generated asset.