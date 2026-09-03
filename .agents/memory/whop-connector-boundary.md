---
name: Provider integration boundary
description: Provider integrations are optional back-office evidence tools, not the customer-facing commerce or banking layer
---

TS Commerce customer checkout, payment links, invoices, subscriptions, and payment status screens must remain first-party. Customers submit payment evidence inside TS Commerce, and merchant approval—not a provider redirect—controls authoritative order and ledger state. Provider connectors may remain available only for explicitly isolated back-office evidence/import tooling.

**Why:** The product direction is to own the customer-facing commerce and payment experience rather than send customers to existing provider websites. A hosted redirect is also not proof of payment.

**How to apply:** Public checkout responses must return a TS Pay/native payment intent with no purchase URL. Store customer references as pending evidence, require locked/idempotent merchant verification before posting sale or invoice accounting, and keep provider-specific helpers out of public routes. Preserve historical provider records without treating them as the new customer flow.