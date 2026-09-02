# Add the Roxyon MCP server to any client

The server runs on **stdio** as `npx -y @roxyon/mcp`. Authenticate once with
`roxyon login`, or set `ROXYON_TOKEN` (a `roxp_…` PAT — `roxyon token create`)
in the client's `env`.

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
