---
name: Domain event replay boundary
description: Rules for transactional event emission, outbox processing, and safe projection replay across connected commerce modules.
---

Authoritative commerce mutations write their versioned tenant event in the same database transaction. Outbox consumers may build notifications, automation observations, analytics, and other projections, but events never replace the ledger, inventory movements, or entity state as sources of truth.

**Why:** Interface-specific side effects create feature islands, while replaying authoritative mutations can duplicate payments, stock commitments, refunds, or other irreversible business facts.

**How to apply:** Emit deterministic events after authoritative writes within the same transaction. Make consumers receipt-idempotent and retryable. Replay only projection consumers; never invoke original commerce commands from replay.