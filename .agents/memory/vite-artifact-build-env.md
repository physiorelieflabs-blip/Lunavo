---
name: Vite artifact build environment
description: Runtime-only artifact variables should not make workspace production builds fail.
---

Vite configs for artifact previews need safe build-time defaults for PORT and BASE_PATH while workflows continue to supply their mounted preview values at runtime.

**Why:** The workspace build runs package builds without workflow environment variables; strict runtime-only checks stopped the full production build before application code was compiled.

**How to apply:** Keep runtime validation for actual server entrypoints, but let static Vite builds fall back to a valid local port and root base path.