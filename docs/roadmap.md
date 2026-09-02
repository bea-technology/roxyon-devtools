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
| **M1** | `@roxyon/api-client` + `@roxyon/deploy-core` + `@roxyon/cli` (`login/init/deploy/logs/env/…`) | **done** (client + CLI). `POST /applications/deploy` & `POST /sites/deploy` console endpoints still to ship |
| **M1.5** | `PersonalAccessTokens` class + `/_account/tokens` cloud functions; `roxyon token`; Bearer auth on the console endpoints | next |
| **M2** | `@roxyon/mcp` — MCP server wrapping `@roxyon/api-client` + `@roxyon/deploy-core`. 11 tools, 3 doc resources, 2 prompts. | **stdio done.** Remaining: Streamable-HTTP transport + OAuth (blocked on M1.5 PATs); more tools (`roxyon_provision_database`); registry listings (Anthropic, Cursor, Smithery, Glama, PulseMCP, mcp.so) |
| **M3** | Docs/knowledge layer: `llms.txt` + flat markdown on `lumenjs.com` & `roxyon.com`; BaaS **OpenAPI 3.1** at `roxyon.com/openapi.json`; publish the existing `lumenjs-spec.md` at `lumenjs.com/llms/lumenjs.md`; shared `runtimes.json`. | |
| **M4** | `create-roxyon-app` — templates `lumen-spa`, `lumen-baas`, `node-api`, `next`; emits `AGENTS.md`, `roxyon.json`, `llms.txt`, `.cursor/rules`, `.github/copilot-instructions.md`. | |
| **M5** | Platform wrappers: Claude Code plugin (MCP + skills + `/roxyon-deploy`), ChatGPT connector + Custom GPT (OpenAPI Actions), Gemini CLI extension, Cursor/Windsurf/Cline install snippets; promote the git deploy-key/webhook flow into a real "Roxyon" GitHub App. | |
| **M6** | Open-source everything, tutorials, examples, canonical Q&A — so future model training absorbs LumenJS/Roxyon. | |

## Why MCP is the keystone

One well-built MCP server is consumed by every assistant listed above. The CLI
and OpenAPI spec cover the rest (CI, ChatGPT Actions, any function-calling
client). Everything in M4–M5 is a thin manifest on top of M2 + M3.
