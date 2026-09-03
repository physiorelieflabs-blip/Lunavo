---
name: Invoice payment accounting
description: Financial-integrity rules for turning customer invoice payment evidence into authoritative merchant revenue.
---

Public invoice payment references are evidence only. They must remain pending until a merchant verifies them. Verification must lock the invoice and evidence record, reject non-collectible invoice states or overpayment, and create the authoritative payment and ledger entry exactly once in the same transaction.

**Why:** A customer-supplied reference is not proof of settlement, while concurrent merchant reviews can otherwise double-credit revenue, lose paid amounts, or resurrect void invoices.

**How to apply:** Reuse the authoritative payment and ledger path for every invoice collection method. Keep public submission separate, require guarded status transitions, and use a unique evidence source for idempotency.