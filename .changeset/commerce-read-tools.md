---
"@roxyon/api-client": minor
"@roxyon/mcp": minor
---

Add read-only commerce tools: `roxyon_catalog` (public products with specs, USD list prices per cycle and stock), `roxyon_quote` (the exact checkout total for a new subscription, from the platform's own pricing, in the buyer's currency and tax), `roxyon_list_subscriptions` and `roxyon_list_invoices` (the caller's own, via the console's new `/account/subscriptions` and `/account/invoices`). Catalog and quote need no sign-in. New `BillingApi` in `@roxyon/api-client`.
