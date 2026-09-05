---
name: Supplier ingestion boundary
description: Security and data-quality rules for importing public supplier product pages.
---

Public supplier imports must validate every DNS result as public, pin the validated address for the actual request and each redirect, and reject unsupported currencies or unbounded/over-precise prices before persistence.

**Why:** URL validation alone does not prevent DNS rebinding, and malformed supplier prices or currencies can contaminate catalog and merchant accounting data.

**How to apply:** Preserve these checks in new supplier refresh, batch-import, and refresh-acceptance paths; never rely only on client-side validation or a later database constraint.