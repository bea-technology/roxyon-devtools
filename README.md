# roxyon-devtools

Tooling that lets a developer — or an AI assistant acting for one — build with
**LumenJS**, use the **Roxyon BaaS**, and **deploy to Roxyon infrastructure**
from anywhere.

| Package | What it is | Status |
|---|---|---|
| [`@roxyon/api-client`](packages/api-client) | Typed client for the Roxyon BaaS (`RX` engine) + the Applications/Sites deploy endpoints | **M1** |
| [`@roxyon/deploy-core`](packages/deploy-core) | Shared deploy pipeline — project detection, archiving, build/upload/poll orchestration | **M1** |
| [`@roxyon/cli`](packages/cli) | `roxyon` — `login`, `init`, `deploy`, `logs`, `env`, `restart`, `open`, `link` | **M1** |
| [`@roxyon/mcp`](packages/mcp-server) | MCP server (stdio) so Claude Code / Cursor / Gemini CLI / … can drive all of the above | **M2** — stdio done; HTTP+OAuth pending |
| `backend/` | Reference implementation of the two new console endpoints the CLI needs | **M1** — spec + drafts |
| `create-roxyon-app` | Scaffolder that emits `AGENTS.md` + `roxyon.json` + `llms.txt` | M4 (planned) |

See [`docs/roadmap.md`](docs/roadmap.md) for the full plan.

## Quick start

```bash
npm i -g @roxyon/cli
roxyon login
cd my-lumen-app
roxyon init          # writes roxyon.json
roxyon deploy        # builds + uploads + waits for it to go live
```

CI (no interactive login):

```bash
ROXYON_TOKEN=roxp_xxx roxyon deploy --no-follow
```

From an AI assistant — add the MCP server to the client:

```json
{ "mcpServers": { "roxyon": { "command": "npx", "args": ["-y", "@roxyon/mcp"] } } }
```

then the assistant calls `roxyon_init` and `roxyon_deploy`. See
[`packages/mcp-server`](packages/mcp-server).

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
