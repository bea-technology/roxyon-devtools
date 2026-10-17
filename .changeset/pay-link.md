---
"@roxyon/api-client": patch
"@roxyon/mcp": minor
---

Add `roxyon_pay_link` (the console URL where the user pays one of their own open invoices; never charges). Invoices that can't be paid (paid, void, cancelled) no longer carry a pay link. New `isPayable()` / `PAYABLE_STATUSES` in `@roxyon/api-client`.
