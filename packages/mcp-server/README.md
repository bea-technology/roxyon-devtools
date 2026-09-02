# @roxyon/mcp

Model Context Protocol server for Roxyon. Gives any MCP-capable AI assistant the
ability to build LumenJS apps, use the Roxyon BaaS, and deploy apps and web
projects to Roxyon infrastructure.

Runs on **stdio**. A remote Streamable-HTTP transport with OAuth is planned
(needs the M1.5 Personal Access Token work).

## Install

```bash
npm i -g @roxyon/mcp    # or use npx, below
```

Authenticate once with the CLI (the MCP server reuses its stored login):

```bash
npm i -g @roxyon/cli
roxyon login
```

…or set `ROXYON_TOKEN` in the server's environment (CI / headless).

## Add it to a client

**Claude Code** — `.mcp.json` in a project, or `claude mcp add`:

```json
{
  "mcpServers": {
    "roxyon": { "command": "npx", "args": ["-y", "@roxyon/mcp"] }
  }
}
```

**Cursor / Windsurf / Cline** — same shape in their MCP settings.

**Gemini CLI** — `~/.gemini/settings.json` → `mcpServers` → same shape.

Pass through `ROXYON_TOKEN` (and optionally `ROXYON_API_URL`,
`ROXYON_CONSOLE_URL`) via the client's `env` field when not using a stored login.

## What it exposes

**Tools** — `roxyon_whoami`, `roxyon_list_domains`, `roxyon_list_apps`,
`roxyon_init`, `roxyon_deploy` (dry-run unless `confirm:true`), `roxyon_app_status`,
`roxyon_logs`, `roxyon_restart`, `roxyon_env_get`, `roxyon_env_set`,
`roxyon_link_github`. Every side-effecting tool requires `confirm:true`.

**Resources** — `roxyon://docs/lumenjs` (the full LumenJS V1 reference),
`roxyon://docs/baas`, `roxyon://docs/deploy`.

**Prompts** — `scaffold-lumen-app`, `deploy-to-roxyon`.

## Typical flow

1. The assistant reads `roxyon://docs/lumenjs` + `roxyon://docs/baas`, writes the
   app.
2. `roxyon_init { dir }` → writes `roxyon.json`.
3. `roxyon_deploy { dir }` → dry-run plan.
4. `roxyon_deploy { dir, confirm: true }` → builds, uploads, waits for it to go
   live (app runtimes) and reports the URL or the failure reason.
