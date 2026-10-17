---
"@roxyon/api-client": minor
"@roxyon/mcp": minor
"@roxyon/cli": minor
---

`roxyon_order`: an agent places a new hosting/server order for the signed-in user (dry run = server quote + token budget; `confirm:true` creates the subscription and a pending invoice that a person pays). Hidden until the console's `POST /account/order` is live (`ROXYON_MCP_ORDERING=1` shows it). PAT scope `billing:order` with a monthly USD budget and allowed SKUs: `roxyon token create <name> --scopes billing:order --budget 50 --skus SCALE-S`. Tools whose console routes aren't live yet (databases, emails, SSH password, WordPress installer) are hidden unless `ROXYON_MCP_PROVISIONING=1`. A route that answers with a web page now gives a short "not available on this server yet" error.
