# Roadmap

The goal: a developer using **any** AI assistant (Claude, ChatGPT, Gemini,
DeepSeek, Cursor, Windsurf, Cline, Kiro, Copilot, …) can build with LumenJS, use
the Roxyon BaaS, and auto-deploy to Roxyon infrastructure — from a local folder
or a GitHub repo.

The reliable mechanism is a **runtime integration layer** every assistant already
speaks (**MCP**), on top of a **CLI + platform API**, plus **machine-readable
docs** agents fetch on demand. Training-data presence is a slow bonus, never a
dependency.

| Phase | Deliverable | State |
|---|---|---|
| **M1** | `@roxyon/api-client` + `@roxyon/deploy-core` + `@roxyon/cli` (`login/init/deploy/logs/env/…`) | **done** (client + CLI) |
| **backend** | `POST /applications/deploy` + `POST /sites/deploy` console endpoints + `app-source-apply.sh` | **written & wired in `_configs/…/clone/`** (`backend/`), not yet synced to nodes |
| **M1.5** | Personal Access Tokens | **done** (written & wired in `_configs`, not synced). `PersonalAccessTokens` class (`exec/migrate-pat.php`), `patIdentify()` + Bearer accepted on all deploy endpoints, `GET/POST/DELETE /account/tokens`, `GET /account/context` (one PAT-safe call for user+subs+domains), `/applications/deploy` creates the app on first deploy, `roxyon token create/list/revoke`, api-client Bearer support. |
| **M2** | `@roxyon/mcp` — MCP server wrapping `@roxyon/api-client` + `@roxyon/deploy-core`. 11 tools, 3 doc resources, 2 prompts. | **stdio done.** Remaining: Streamable-HTTP transport + OAuth (blocked on M1.5 PATs); more tools (`roxyon_provision_database`); registry listings (Anthropic, Cursor, Smithery, Glama, PulseMCP, mcp.so) |
| **M3** | Docs/knowledge layer. | **drafted** in `docs/` — `llms/{roxyon,lumenjs}.llms.txt`, `openapi/baas.yaml` (validates), `templates/AGENTS.md`, `DISTRIBUTION.md`. Remaining: host them; publish `lumenjs-spec.md` at `lumenjs.com/llms/lumenjs.md`; shared `runtimes.json` |
| **M4** | `create-roxyon-app` — templates `lumen`, `lumen-baas`, `node`; emits `AGENTS.md` / `CLAUDE.md` / `GEMINI.md` / `.cursor/rules` / `.github/copilot-instructions.md`, `roxyon.json`, `llms.txt`. LumenJS templates delegate to `@lmjs/cli`. | **done** — verified end to end |
| **M5** | Platform wrappers in `integrations/`: Claude Code plugin (MCP + `/roxyon-deploy`), ChatGPT Custom GPT (OpenAPI Actions), per-client MCP install snippets. GitHub App = later. | |
| **M6** | Open-source everything, tutorials, examples, canonical Q&A — so future model training absorbs LumenJS/Roxyon. | |

## Why MCP is the keystone

One well-built MCP server is consumed by every assistant listed above. The CLI
and OpenAPI spec cover the rest (CI, ChatGPT Actions, any function-calling
client). Everything in M4–M5 is a thin manifest on top of M2 + M3.
