# integrations/

Thin wrappers on top of `@roxyon/mcp` + `docs/openapi/baas.yaml` — one per
assistant. Everything here is manifest/config; the logic lives in the packages.

| Dir | For | What |
|---|---|---|
| `claude-code-plugin/` | Claude Code | Plugin: MCP server + `roxyon` skill + `/roxyon-deploy`, `/roxyon-new`. Install via the marketplace at the repo root (`.claude-plugin/marketplace.json`). |
| `chatgpt-gpt/` | ChatGPT | Custom GPT instructions + a trimmed Actions OpenAPI (BaaS data, logs, restart/rebuild — not source upload). |
| `mcp-registry/server.json` | MCP registry | `server.json` for publishing `@roxyon/mcp` to the Model Context Protocol registry. |
| `mcp-clients.md` | Cursor, Windsurf, Cline, VS Code, Gemini CLI, Claude Desktop | Copy-paste MCP install snippets. |

## Checklist

- [x] npm — all five packages published `0.1.0` (2026-09-02).
- [ ] **Create `github.com/bea-technology/roxyon-devtools`** and
      `git push -u origin main` (remote is already configured).
- [ ] MCP registry — set up once, then automatic: enable **OIDC trusted
      publishing** on npm per package, and `.github/workflows/release.yml`
      publishes `mcp-registry/server.json` on every release via GitHub OIDC.
      First-time manual publish: `mcp-publisher login github-oidc && mcp-publisher
      publish mcp-registry/server.json` (from a checkout, run by a repo admin).
- [ ] List on Smithery, Glama, PulseMCP, mcp.so, Cursor's directory (each has a
      "submit" form; point them at `@roxyon/mcp` + this repo).
- [ ] Publish the Claude Code plugin marketplace (this repo's
      `.claude-plugin/marketplace.json`) and announce.
- [ ] Create the ChatGPT Custom GPT from `chatgpt-gpt/`.
- [ ] Host `docs/llms/*` + `docs/openapi/baas.yaml` — blocked until `roxyon.com`
      / `lumenjs.com` go live (`docs/publish-docs.sh` stages them).
