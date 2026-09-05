---
name: Subscription regional time
description: Subscription trial and warning day counts follow the merchant's saved IANA billing timezone and local calendar dates.
---

Subscription day thresholds are evaluated using the merchant's saved billing timezone and local calendar dates; UTC instants remain authoritative for audit timestamps. A merchant with no selected payment method has a 24-hour access window; selecting a method moves the account to the 15-day payment grace window.

**Why:** Elapsed 24-hour arithmetic can show the wrong day around local midnight and daylight-saving transitions.

**How to apply:** Resolve the active/default location timezone when a subscription is created or first materialized, persist it with the subscription, and use calendar-day comparisons for trial, warning, and suspension thresholds. Record bank or hosted-payment selection before approval/verification so declined attempts remain recoverable.