---
name: Staff workspace authorization
description: Tenant and location authorization boundaries for owners, invited staff, and multi-workspace users.
---

Authenticated identity does not imply merchant authority. Resolve the active workspace from durable membership, validate any selected workspace against that membership, and enforce explicit route permissions plus operational location scope on the server. The verified master admin may preview a selected merchant through the server-validated workspace selector, but that preview must remain distinct from the admin control-room identity.

**Why:** Owner-only merchant lookup can create a new workspace for invited staff, while permissive or unmapped routes let low-privilege roles mutate financial, customer, or configuration data.

**How to apply:** Keep merchant creation in explicit onboarding. Use fail-closed route policies for staff, preserve owner authority through persisted permissions, and block location-scoped users from tenant-wide domains until those domains have defensible location ownership. Admin preview access should use a dedicated synthetic access context and must not make the merchant subscription appear admin-exempt.