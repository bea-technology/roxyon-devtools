---
"@roxyon/api-client": minor
"@roxyon/cli": patch
"@roxyon/mcp": patch
"@roxyon/deploy-core": patch
---

M5 wrappers + close the PAT gaps.

- `integrations/`: Claude Code plugin (`.mcp.json` + `roxyon` skill +
  `/roxyon-deploy`, `/roxyon-new`) with a repo-root plugin marketplace; ChatGPT
  Custom GPT (instructions + trimmed Actions OpenAPI); `mcp-clients.md`
  (Cursor / Windsurf / Cline / VS Code / Gemini CLI / Claude Desktop snippets);
  `mcp-registry/server.json`.
- `api-client`: `AccountApi.apps()` / `getApp()` and
  `applications.getEnv()` / `setEnv()` now go through new PAT-safe console
  endpoints (`GET /account/apps`, `GET|POST /applications/env`) instead of the
  BaaS — so `roxyon_list_apps`, `roxyon_app_status`, `roxyon_env_*`, `roxyon env`,
  and the deploy poll loop all work with a `roxp_` token.
- `docs/openapi/baas.yaml`: `/account/apps` + `/applications/env` added
  (3.1-valid). `docs/publish-docs.sh` stages the knowledge-layer docs into the
  site repos.

Backend (in `_configs`, `backend/`): `ApplicationEnv.php`, `AccountContext.php`
`apps()` branch, routing.
