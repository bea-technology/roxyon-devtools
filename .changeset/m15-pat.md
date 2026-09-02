---
"@roxyon/api-client": minor
"@roxyon/deploy-core": minor
"@roxyon/cli": minor
"@roxyon/mcp": patch
---

M1.5: Personal Access Tokens.

- `@roxyon/api-client`: a `roxp_…` token in `sessionToken` is sent as
  `Authorization: Bearer` on console calls (and nothing to the BaaS). New
  `TokensApi` (create/list/revoke) and `AccountApi.context()` — one call
  returning user + subscriptions + domains, resolvable by a PAT so a CI job
  never touches the BaaS. `applications.uploadSource()` accepts create-params
  for a first deploy. `applications.logs()` now parses the real
  `{processes:[{output}]}` shape.
- `@roxyon/deploy-core`: `deployProject()` resolves everything via
  `/account/context` and lets the console create the application on first
  deploy — works identically with a session token or a PAT.
- `@roxyon/cli`: `roxyon token create|list|revoke`; `whoami` uses the context call.
- `@roxyon/mcp`: `roxyon_whoami` / `list_domains` / `init` use the context call
  (PAT-compatible).

Backend (in `_configs`, `backend/`): `PersonalAccessTokens` class
(`migrate-pat.php`), `patIdentify()` + `apiCaller()` in `server.php`, Bearer
accepted on every deploy endpoint with scope checks, `GET/POST/DELETE
/account/tokens`, `GET /account/context`, and `/applications/deploy` creating
the app rows on first deploy.
