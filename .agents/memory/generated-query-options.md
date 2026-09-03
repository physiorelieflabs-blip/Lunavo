---
name: Generated query options
description: TanStack query hooks generated from the API contract require an explicit query key when custom query options are passed.
---

When passing custom query options to a generated query hook, include that hook's generated query key alongside options such as retry or staleTime.

**Why:** The generated hook types require the query key in the options object, and omitting it can leave the production build green while the storefront typecheck fails.

**How to apply:** Use the matching get*QueryKey helper with the same path parameters whenever overriding generated query behavior.