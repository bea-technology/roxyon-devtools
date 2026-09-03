# roxyon-devtools

Tooling that lets a developer — or an AI assistant acting for one — build with
**LumenJS**, use the **Roxyon BaaS**, and **deploy to Roxyon infrastructure**
from anywhere.

| Package | What it is | Status |
|---|---|---|
| [`@roxyon/api-client`](packages/api-client) | Typed client for the Roxyon BaaS (`RX` engine) + the Applications/Sites deploy endpoints | **M1** |
| [`@roxyon/deploy-core`](packages/deploy-core) | Shared deploy pipeline — project detection, archiving, build/upload/poll orchestration | **M1** |
| [`@roxyon/cli`](packages/cli) | `roxyon` — `login`, `init`, `deploy`, `logs`, `env`, `restart`, `open`, `link` | **M1** |
| [`@roxyon/mcp`](packages/mcp-server) | MCP server — **stdio** (`roxyon-mcp`) for local clients, **remote Streamable HTTP + OAuth** (`roxyon-mcp-http`) for hosted connectors | **M2** |
| [`backend/`](backend) | The two new console endpoints + node script (`/applications/deploy`, `/sites/deploy`, `app-source-apply.sh`) | written & wired in `_configs`, not synced |
| [`docs/`](docs) | `llms.txt`, BaaS OpenAPI 3.1, `AGENTS.md` template, distribution checklist | **M3** — drafted |
| [`create-roxyon-app`](packages/create-roxyon-app) | `npm create roxyon-app` — LumenJS / Node templates, emits `AGENTS.md` + `roxyon.json` + `llms.txt` + editor rules | **M4** |
| [`integrations/`](integrations) | Per-assistant wrappers — Claude Code plugin, ChatGPT GPT, Cursor/etc. install snippets | **M5** |

See [`docs/roadmap.md`](docs/roadmap.md) for the full plan.

## Quick start

```bash
npm create roxyon-app@latest my-app     # LumenJS or Node, wired for deploy
cd my-app
npm i -g @roxyon/cli && roxyon login
roxyon deploy                            # builds + uploads + waits for it to go live
```

Existing project instead of a new one: `roxyon init` writes `roxyon.json`, then
`roxyon deploy`.

CI (no interactive login) — create a token once, then use it as `ROXYON_TOKEN`:

```bash
roxyon token create ci --scopes deploy,logs      # prints roxp_… once
ROXYON_TOKEN=roxp_xxx roxyon deploy --no-follow   # first run also creates the app
```

### From an AI assistant

**Local clients** (Claude Code, Cursor, Windsurf, Cline, Gemini CLI) — add the
stdio server:

```json
{ "mcpServers": { "roxyon": { "command": "npx", "args": ["-y", "@roxyon/mcp"] } } }
```

then the assistant calls `roxyon_init` and `roxyon_deploy`.

**Claude Code plugin** — bundles the server + `/roxyon-deploy` and `/roxyon-new`
slash commands + a skill:

```
/plugin marketplace add bea-technology/roxyon-devtools
/plugin install roxyon
```

**Remote connectors** (claude.ai, ChatGPT, Cursor URL) — connect to
`https://mcp.roxyon.com/mcp` and sign in with your Roxyon account (OAuth, no
token to paste). `roxyon_init` / `roxyon_deploy` are local-only there; use
`roxyon_link_github` for push-to-deploy.

**Add to Cursor:**

[![Add to Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](cursor://anysphere.cursor-deeplink/mcp/install?name=roxyon&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkByb3h5b24vbWNwIl19)

See [`packages/mcp-server`](packages/mcp-server) and
[`integrations/mcp-clients.md`](integrations/mcp-clients.md).

## Develop

```bash
corepack enable pnpm
pnpm install
pnpm build        # all packages
pnpm test
pnpm typecheck
pnpm lint
```

Node ≥ 20. The repo is a pnpm workspace; `tsup` builds each package, `vitest`
tests, `biome` lints + formats, `changesets` versions releases.

## How deploy works

- **LumenJS / static** (`runtime: "lumen"`, `kind: "static"`): `roxyon deploy`
  runs `lm build --serverless`, tars `dist/`, and `POST`s it to `/sites/deploy`,
  which extracts it into the host's document root. Served directly by nginx.
- **Node / Python / PHP** (`kind: "app"`): the tarball goes to
  `/applications/deploy`, which lands it in the application's `SourcePath` and
  bumps `ConfigRevision`. The existing reconciler builds it in an isolated
  release dir and runs it under a systemd unit. Git remotes connected with
  `roxyon link` auto-deploy on push via the existing webhook.

Authentication is a Roxyon **session token** today (stored `0600` in
`~/.roxyon/config.json`); scoped **Personal Access Tokens** land in M1.5.
