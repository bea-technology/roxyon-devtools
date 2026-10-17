---
"@roxyon/mcp": minor
"@roxyon/api-client": minor
"@roxyon/cli": minor
---

Agent ordering: `roxyon_order` places a new hosting plan or cloud server for the signed-in user (dry run first with the exact quote and the token's budget, `confirm:true` to place it); the platform creates the subscription and a pending invoice, and a person pays at the returned link. Nothing is charged by the tool. Tokens made with the new `billing:order` scope carry a monthly USD budget and an optional SKU allow-list (`roxyon token create <name> --scopes billing:order --budget 50 --skus LAUNCH-S`), enforced server-side. New `BillingApi.order()` in `@roxyon/api-client`. The tool is hidden unless the server sets `ROXYON_MCP_ORDERING=1`.
