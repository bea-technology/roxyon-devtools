---
"@roxyon/deploy-core": minor
"@roxyon/mcp": minor
"@roxyon/cli": patch
---

M2: MCP server + shared deploy core.

- `@roxyon/deploy-core` (new) — the deploy pipeline the CLI and MCP server share:
  project-type detection, deterministic archiving with `.roxyonignore`, the
  `deployProject()` build → upload → poll orchestration, and stored-credential
  helpers. `@roxyon/cli`'s `deploy`/`init` now delegate to it.
- `@roxyon/mcp` (new) — stdio MCP server. 11 tools (`roxyon_whoami`,
  `roxyon_list_domains`/`_apps`, `roxyon_init`, `roxyon_deploy` [dry-run unless
  `confirm:true`], `roxyon_app_status`, `roxyon_logs`, `roxyon_restart`,
  `roxyon_env_get`/`_set`, `roxyon_link_github`), 3 doc resources
  (`roxyon://docs/lumenjs` — the full LumenJS V1 reference —, `.../baas`,
  `.../deploy`), and 2 prompts. Reuses the CLI's stored login or `ROXYON_TOKEN`.
