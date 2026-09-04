---
name: Media persistence boundary
description: Durable picture uploads, tenant ownership, and the storage-provider fallback decision.
---

Picture uploads must be validated, tenant-owned, and persisted before they are exposed or reused. Browser object URLs and local storage are not acceptable publication storage.

**Why:** App Storage provisioning was unavailable in this workspace because the cloud budget was exhausted, so the initial implementation uses database-backed image data to keep uploads durable rather than silently shipping a temporary client-only flow.

**How to apply:** Keep the current server-side MIME, filename, size, and magic-byte checks and tenant authorization. When App Storage is available again, move the image bytes behind the existing media API to private object storage without changing the user-facing media contract.