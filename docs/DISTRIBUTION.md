# Distribution — making every AI platform "recognise" Roxyon

Two layers. The **knowledge layer** (this `docs/` dir) is what a model reads at
runtime to write correct LumenJS / BaaS code. The **capability layer** (the MCP
server + CLI) is what lets an assistant actually deploy.

## 1. Knowledge layer — host these

| File | Host at | Purpose |
|---|---|---|
| `llms/roxyon.llms.txt` | `https://roxyon.com/llms.txt` | The llms.txt convention — assistants fetch this first |
| `llms/lumenjs.llms.txt` | `https://lumenjs.com/llms.txt` | Same, for the framework site |
| `../packages/mcp-server/resources/lumenjs.md` | `https://lumenjs.com/llms/lumenjs.md` | Full LumenJS V1 reference (already written) |
| `../packages/mcp-server/resources/baas.md` | `https://roxyon.com/llms/baas.md` | BaaS reference |
| `../packages/mcp-server/resources/deploy.md` | `https://roxyon.com/llms/deploy.md` | Deploy model |
| `openapi/baas.yaml` | `https://roxyon.com/openapi.yaml` | OpenAPI 3.1 — unlocks ChatGPT Actions & any function-calling client |

Also: link `llms.txt` from a `<link rel="alternate" type="text/plain">` in each
site's `<head>`, and keep a plain-markdown copy of every docs page at a stable
URL.

## 2. Capability layer — list the MCP server

Publish `@roxyon/mcp` and submit to:

- Anthropic MCP registry
- Cursor's MCP directory
- Smithery (`smithery.ai`), Glama (`glama.ai`), PulseMCP, `mcp.so`
- The `@modelcontextprotocol/servers` community list (PR)

Each listing needs: the `npx @roxyon/mcp` command, the tool list, and the auth
note (`roxyon login` or `ROXYON_TOKEN`).

## 3. Per-platform wrappers (thin, once 1 + 2 exist)

| Platform | Wrapper |
|---|---|
| Claude Code | plugin = MCP server + `/roxyon-deploy` slash command; claude.ai Connector |
| ChatGPT | MCP connector **and** a "Roxyon Deploy" GPT with Actions from `openapi/baas.yaml` |
| Gemini CLI | extension bundling the MCP server + `GEMINI.md` |
| Cursor / Windsurf / Cline | one-click MCP install link + a rules snippet |
| Kiro | MCP config + a steering file |
| GitHub | promote the deploy-key/webhook flow into a "Roxyon" GitHub App |

## 4. Scaffolding (`create-roxyon-app`, M4)

Every new project gets `roxyon.json`, `templates/AGENTS.md` (filled in), an
`llms.txt` pointer, and editor shims generated from the same `AGENTS.md` body.

## 5. Training-data long game

Open-source the repos with real READMEs, publish tutorials and a few canonical
Q&A answers. Models trained afterward may absorb it — a bonus, never the plan.
