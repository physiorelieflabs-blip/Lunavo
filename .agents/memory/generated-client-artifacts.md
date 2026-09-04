---
name: Generated client artifacts
description: The API client package commits generated declaration output alongside its TypeScript source.
---

When changing an exported API-client function signature, regenerate the client declarations before typechecking consuming artifacts.

**Why:** Consumers resolve the package's committed declaration output, so source-only changes can appear correct while the application still sees the old public type.

**How to apply:** Run the API client package's composite TypeScript build before the commerce app typecheck whenever its exports change.