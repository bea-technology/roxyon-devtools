# Add the Roxyon MCP server to any client

Two ways to connect:

- **Local (stdio)** — `npx -y @roxyon/mcp`. Authenticate once with `roxyon login`,
  or set `ROXYON_TOKEN` (a `roxp_…` PAT — `roxyon token create`) in the client's
  `env`. Full tool set including `roxyon_init` / `roxyon_deploy` (they need your
  local project files).
- **Remote (hosted)** — `https://mcp.roxyon.com/mcp`. OAuth 2.1: the client
  registers itself, you sign in with your Roxyon account and approve a consent
  screen — no token to paste. Nine API-shaped tools; `roxyon_init` /
  `roxyon_deploy` return a "use the CLI locally" message (use
  `roxyon_link_github` + push instead).

## Remote — claude.ai / ChatGPT / Cursor (URL)

| Client | Where |
|---|---|
| claude.ai | Settings → Connectors → Add custom connector → `https://mcp.roxyon.com/mcp` |
| ChatGPT | Settings → Connectors → add `https://mcp.roxyon.com/mcp` (dev mode / Pro) |
| Cursor | Settings → MCP → Add Custom MCP → Type **URL** → `https://mcp.roxyon.com/mcp` |
| Claude Code | `claude mcp add --transport http roxyon https://mcp.roxyon.com/mcp` |

## Claude Code

`.mcp.json` in the project, or `claude mcp add`:

```json
{ "mcpServers": { "roxyon": { "command": "npx", "args": ["-y", "@roxyon/mcp"] } } }
```

Or install the plugin (`integrations/claude-code-plugin`) for the slash commands
and skill too.

## Claude Desktop

`claude_desktop_config.json` → `mcpServers` → the same block.

## Cursor

`~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (project):

```json
{ "mcpServers": { "roxyon": { "command": "npx", "args": ["-y", "@roxyon/mcp"] } } }
```

## Windsurf

`~/.codeium/windsurf/mcp_config.json` → `mcpServers` → the same block.

## Cline / Roo Code

MCP Servers panel → *Configure MCP Servers* → add the same block.

## VS Code (GitHub Copilot agent mode)

`.vscode/mcp.json`:

```json
{ "servers": { "roxyon": { "type": "stdio", "command": "npx", "args": ["-y", "@roxyon/mcp"] } } }
```

## Gemini CLI

`~/.gemini/settings.json`:

```json
{ "mcpServers": { "roxyon": { "command": "npx", "args": ["-y", "@roxyon/mcp"] } } }
```

## Passing a token

```json
{
  "mcpServers": {
    "roxyon": {
      "command": "npx",
      "args": ["-y", "@roxyon/mcp"],
      "env": { "ROXYON_TOKEN": "roxp_xxx" }
    }
  }
}
```
