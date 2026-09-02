---
name: Source-attributed AI research
description: Boundary for web research features that combine external public sources with tenant-scoped commerce assistance
---

Web research must remain a read-only evidence workflow: return the query, source URLs, snippets or claims, search time, provider, and explicit limitations. Do not present search output as exhaustive truth, and do not let research execution mutate merchant data, publish campaigns, move money, or contact customers.

**Why:** Public web results can be incomplete, stale, or misleading, while commerce actions require tenant isolation and an explicit approval boundary.

**How to apply:** Keep search provider inputs narrow and user-entered, fetch only through the server, show citations beside derived guidance, and route any resulting commerce action through the existing approval and audit flow.