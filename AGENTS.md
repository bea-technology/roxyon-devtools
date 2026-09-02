# AGENTS.md — roxyon-devtools

Contributor guide for humans and coding agents working in this repo.

## What this is

A pnpm/TypeScript monorepo:

- `@roxyon/api-client` — wraps the Roxyon BaaS (`RX` engine) and the console
  deploy endpoints. No filesystem, no build tooling — pure HTTP.
- `@roxyon/deploy-core` — the shared deploy pipeline (detection, archiving,
  `deployProject()` orchestration, credential helpers). Depends on api-client.
- `@roxyon/cli` — the `roxyon` command. Thin; delegates deploy/init to deploy-core.
- `@roxyon/mcp` — stdio MCP server. Thin wrapper over api-client + deploy-core.
- `backend/` — reference PHP for two new console endpoints (not built here).

Dependency direction is one-way: `api-client ← deploy-core ← {cli, mcp}`. Never
import cli internals from mcp (or vice-versa) — put shared code in deploy-core.

## Ground rules

- **Node ≥ 20, ESM only.** No CJS source. `type: "module"` everywhere.
- `pnpm build && pnpm typecheck && pnpm test && pnpm lint` must pass before a PR.
- Formatting + lint is **biome** — run `pnpm format`. Single quotes, trailing
  commas, 100 cols, 2-space indent.
- `api-client` uses `moduleResolution: NodeNext` (it ships dual ESM/CJS). `cli`
  uses `Bundler` (tsup bundles it).
- Add a changeset for any user-facing change: `pnpm changeset`.

## The BaaS, in one paragraph

Parse-like "RX" engine at `https://www.beaapis.com/1`. Auth header
`x-bea-session-token`. **Writes resolve on failure instead of rejecting** — the
body carries `error` at the top level or inside `results[]`. Always pass write
responses through `assertOk()` / `rxError()` (`packages/api-client/src/errors.ts`).
The `in` operator wants a **comma-joined string**, not an array. `GET` queries
use PHP bracket notation (`where[User]=x`) — see `src/query.ts`.

## Deploy model

`roxyon.json` (`packages/cli/src/config.ts` → `ProjectConfig`) describes a
project. `kind: "static"` → `/sites/deploy` (docroot). `kind: "app"` →
create `Applications` + `ApplicationProcesses` + `ApplicationRoutes`, then
`/applications/deploy` bumps `ConfigRevision` and a server-side reconciler
builds + runs it. Don't invent new fields for the runtime catalog — it is
mirrored verbatim from the console form in `src/runtimes.ts`.

## Testing

Vitest, mocked `fetch` (see `packages/api-client/test/auth.test.ts` for the
pattern). No live network in unit tests. End-to-end deploy testing needs a real
Roxyon test account and the `backend/` endpoints deployed — see `backend/README.md`.

## Layout

```
packages/api-client/src/
  client.ts         transport, auth-header precedence, anon-token minting
  auth.ts           login / precheck / OTP / me / logout
  applications.ts   Applications CRUD + console endpoints (deploy/logs/action/repo)
  sites.ts          static-site upload
  subscriptions.ts  Privileges -> Subscriptions resolution
  domains.ts, env.ts, runtimes.ts, query.ts, errors.ts
packages/deploy-core/src/
  archive.ts        tar+gzip with .roxyonignore / .gitignore, deterministic
  detect.ts         project-type detection for `init`
  project.ts        roxyon.json load/save + buildProjectConfig()
  credentials.ts    ~/.roxyon/config.json + env overrides
  deploy.ts         deployProject() — build -> pack -> upload -> poll, event-reported
  run-command.ts    default build-command spawner
packages/cli/src/
  index.ts          commander wiring
  commands/*.ts     one file per command group (thin; call deploy-core)
  config.ts         re-exports deploy-core config
  context.ts, ui.ts
packages/mcp-server/src/
  server.ts         createServer() — wires tools + resources + prompts
  tools.ts          the 11 roxyon_* tools (guard() wraps errors)
  resources.ts      roxyon://docs/{lumenjs,baas,deploy}
  prompts.ts, session.ts, result.ts
packages/mcp-server/resources/   lumenjs.md (copied spec), baas.md, deploy.md
backend/            reference PHP + shell for the new console endpoints
```
