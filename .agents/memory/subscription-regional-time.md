---
name: Subscription regional time
description: Subscription trial and warning day counts follow the merchant's saved IANA billing timezone and local calendar dates.
---

Subscription day thresholds are evaluated using the merchant's saved billing timezone and local calendar dates; UTC instants remain authoritative for audit timestamps.

**Why:** Elapsed 24-hour arithmetic can show the wrong day around local midnight and daylight-saving transitions.

**How to apply:** Resolve the active/default location timezone when a subscription is created or first materialized, persist it with the subscription, and use calendar-day comparisons for trial, warning, and suspension thresholds.