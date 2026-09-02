# integrations/

Thin wrappers on top of `@roxyon/mcp` + `docs/openapi/baas.yaml` — one per
assistant. Everything here is manifest/config; the logic lives in the packages.

| Dir | For | What |
|---|---|---|
| `claude-code-plugin/` | Claude Code | Plugin: MCP server + `roxyon` skill + `/roxyon-deploy`, `/roxyon-new`. Install via the marketplace at the repo root (`.claude-plugin/marketplace.json`). |
| `chatgpt-gpt/` | ChatGPT | Custom GPT instructions + a trimmed Actions OpenAPI (BaaS data, logs, restart/rebuild — not source upload). |
| `mcp-registry/server.json` | MCP registry | `server.json` for publishing `@roxyon/mcp` to the Model Context Protocol registry. |
| `mcp-clients.md` | Cursor, Windsurf, Cline, VS Code, Gemini CLI, Claude Desktop | Copy-paste MCP install snippets. |

## Publishing checklist

- [ ] `npm publish` the packages (`@roxyon/api-client`, `@roxyon/deploy-core`,
      `@roxyon/cli`, `@roxyon/mcp`, `create-roxyon-app`).
- [ ] Submit `mcp-registry/server.json` to the MCP registry.
- [ ] List on Smithery, Glama, PulseMCP, mcp.so, Cursor's directory.
- [ ] Publish the Claude Code plugin marketplace (this repo) and announce.
- [ ] Create the ChatGPT Custom GPT from `chatgpt-gpt/`.
- [ ] Host the `docs/llms/*` + `docs/openapi/baas.yaml` (see `docs/DISTRIBUTION.md`).
