---
name: Clerk account settings
description: Constraints for account profile and password changes in the managed Clerk setup
---

Clerk profile attributes such as first name, last name, and username are controlled by the managed instance's enabled user-profile settings; a frontend user.update call cannot enable a disabled attribute. Password changes for a signed-in user should use the authenticated user's updatePassword API rather than only linking to password recovery.

**Why:** Clerk documents the attribute-setting prerequisite, and a recovery link is not the same flow as changing a password from an authenticated settings page.

**How to apply:** Keep profile saves granular so a username failure does not discard a successful name update, surface the provider error, and provide an in-session password form with confirmation and session invalidation.