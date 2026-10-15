---
"@roxyon/api-client": minor
"@roxyon/mcp": minor
---

Add BaaS V2 data tools for the user's own app: `roxyon_baas_query`, `roxyon_baas_get`, `roxyon_baas_create`, `roxyon_baas_update`, `roxyon_baas_delete` and `roxyon_baas_batch`. They call `https://www.beaapis.com/2` (`/records`, `/batch`) as the app's backend with the secret key `RX_SECRET_KEY` (`rxsk_…`) from the project's `.env`, and run in the local (stdio) server only. Writes need `confirm:true`. New `BaasDataApi` in `@roxyon/api-client`.
