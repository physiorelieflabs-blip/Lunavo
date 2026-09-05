---
name: Customer bank payment destination
description: Public store checkout uses the merchant's linked bank account for direct customer transfers.
---

The linked merchant bank account is also the customer-facing payment destination for published storefronts. Checkout may show the beneficiary, bank, bank code, account number, and settlement currency, but customer evidence remains unverified until the merchant approves it.

**Why:** Keeping one explicitly configured destination makes the customer flow simple while preserving the separation between public payment instructions and authoritative accounting.

**How to apply:** Require a linked bank account before publishing or accepting public-store orders. Decrypt only for the dedicated customer-safe destination response; never expose ciphertext or unrelated withdrawal records. Post payment and ledger effects only through the existing verified-payment transaction.