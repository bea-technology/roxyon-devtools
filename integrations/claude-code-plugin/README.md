# Roxyon — Claude Code plugin

Bundles the `roxyon` MCP server, a `roxyon` skill, and `/roxyon-deploy` +
`/roxyon-new` slash commands.

## Install

From a marketplace (once published):

```
/plugin marketplace add bea-technology/roxyon-devtools
/plugin install roxyon
```

Or point Claude Code at this directory directly during development.

## Auth

The MCP server reuses `roxyon login` (`~/.roxyon/config.json`). For a headless
setup, set `ROXYON_TOKEN` in `.mcp.json`'s `env` (create one with
`roxyon token create ci`).

## Contents

| Path | What |
|---|---|
| `.mcp.json` | declares the `roxyon` MCP server (`npx -y @roxyon/mcp`) |
| `commands/roxyon-deploy.md` | `/roxyon-deploy` — dry-run then confirm |
| `commands/roxyon-new.md` | `/roxyon-new` — scaffold a project |
| `skills/roxyon/SKILL.md` | the deploy + LumenJS + BaaS workflow |
