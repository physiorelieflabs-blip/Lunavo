---
name: Workspace test runner
description: API TypeScript tests need to run through a workspace package that provides tsx.
---

Run TypeScript API tests from the database workspace when the API package does not expose tsx directly; the workspace package resolution is otherwise unable to load the test runner.

**Why:** Root and API-package test invocations failed before the same tests passed from the database workspace, because tsx is declared there rather than at the root/API package.

**How to apply:** Use the database workspace's pnpm exec tsx command with paths to API tests for one-off verification; do not install a duplicate runner.