# roxyon-devtools — live state

## UPDATE 2026-10-14
- Per the user (relayed): LumenJS pinned to **2.5.7** (changeset `lmjs-2-5-7.md`); BaaS tools **reworked for V2**:
  `roxyon_baas_{query,get,create,update,delete,batch}` on `https://www.beaapis.com/2` (`/records`, `/batch`) with
  `X-RX-Secret-Key` from `.env` `RX_SECRET_KEY` (`rxsk_…`). No schema tools: a secret key cannot reach V2 schema
  (console API only). Build, lint, typecheck, tests all green. Still uncommitted: waiting for the user to approve the
  commit directly in this session. Not yet run against a real app.

## HANDOFF (2026-10-13, written by mac-roxyon-devtools c2 / amohsen1001)

Nothing below depends on a conversation. Longer narrative:
`roxyon-knowledge/_sessions/mac-roxyon-devtools-amohsen1001.md` (c2) and
`mac-roxyon-devtools-abdulrmohsen.md` (c1, last active 2026-09-16).

### What is live
- npm: `@roxyon/mcp` 0.4.0, `@roxyon/api-client` 0.3.0, `@roxyon/deploy-core` 0.3.0, `@roxyon/cli` 0.1.3,
  `create-roxyon-app` 0.1.3. Includes the c1 session's database / email / SSH-password / WordPress tools (d6c111a).
- Hosted MCP: mcp.roxyon.com (`roxyon-mcp-http`, OAuth). 23 tools over HTTP in the released version.
- `packages/rxjs` (owner: the roxyon-engage session): source of truth for rx.js. 1.0.0 = V1 as published;
  2.0.0 to 2.0.3 = BaaS V2. Published by hand to `cdn.roxyon.com/libs/rxjs/<version>/rx.js`
  (gwf container on app-1). Never overwrite a published version.

### Broken right now
- **CI and Release on `main` fail since the rxjs commits (62bca55 … f377662, 2026-10-12).** Locally `pnpm lint`
  fails on HEAD with ~100 biome errors, all in `packages/rxjs` (published copies `v1/`, `v2.0.x/` and `src/`).
  Build, typecheck and tests pass. Likely fix: exclude `packages/rxjs/v*/**` (frozen published files) in
  `biome.json` and fix or exclude `src/rx.js`. Not done: that package is not this session's.
  Until fixed, no merge to `main` can release.

### Uncommitted in the working tree (all from the c2 devtools session, 2026-10-04 to 10-07)
1. **LumenJS pin 2.5.2**: `packages/create-roxyon-app/src/scaffold.ts` (`LMJS_VERSION`),
   `packages/mcp-server/resources/lumenjs.md`, `packages/mcp-server/src/prompts.ts`,
   `docs/llms/lumenjs.llms.txt`, `.changeset/lmjs-2-5-2.md` (patch: create-roxyon-app, @roxyon/mcp).
   **Stale**: `/Users/Shared/www/CLAUDE.md` says use 2.5.3, and npm `@lmjs/cli` latest is 2.5.7 (2026-10-13).
   Decide the version, then change `LMJS_VERSION`, the three docs and rename the changeset.
2. **BaaS data tools (V1)**: `packages/api-client/src/baas-data.ts` (+ export in `index.ts`, test
   `test/baas-data.test.ts`), `packages/mcp-server/src/baas-tools.ts` (registered in `server.ts`; tests
   `test/server.test.ts`, `test/http.test.ts` expect 29 tools), `.changeset/baas-data-tools.md`
   (minor: api-client, mcp). Six tools `roxyon_baas_{schema,add_columns,query,create,update,delete}`; keys from
   the project `.env` (`RX_APPLICATION_ID`, `RX_REST_KEY`); local stdio only; writes need `confirm:true`.
   **Never run against a real app.** They speak **V1** (`https://www.beaapis.com/1`, app id + REST key).
   BaaS V2 went live at `/2` and V1 was frozen on 2026-10-12 (user decision), so these probably need to be
   reworked for V2 (`rxsk_…` secret key, per-class rules, DELETE = trash) before release. See
   `roxyon-knowledge/_configs/baas.md`.

### Next steps, in order
1. Get CI green again (rxjs lint, above) — with the rxjs owner.
2. User decision: LumenJS version to pin (2.5.3 per CLAUDE.md, or newer).
3. User decision: ship the BaaS tools as V1, rework for V2, or both. Then test against a throwaway app.
4. `pnpm build && pnpm lint && pnpm typecheck && pnpm test`, commit, push. A merge to `main` with changesets
   opens a "version packages" PR; merging that publishes to npm.

### Waiting on the user
- Approval to commit and push anything in this repo (nothing has been approved).
- The two decisions above.
- Older, from c1: FTP provisioning is deferred (console UI writes `FtpAccounts` rows nothing acts on).
- Older: whether `roxyon deploy`'s default `lm build --serverless` should pin an `@lmjs/cli` version.

### Commands
- Checks: `pnpm install && pnpm build && pnpm lint && pnpm typecheck && pnpm test`
- Local MCP smoke test: `node packages/mcp-server/dist/bin.js` (stdio) after `pnpm build`.
- Release: changesets; workflow `.github/workflows/release.yml`.
- PHP syntax checks on `_configs`: `/opt/homebrew/opt/php@8.3/bin/php -l` (default `php` is 7.4 and cannot
  parse that code).

### Config and secrets (locations only)
- npm publish token and MCP registry auth: GitHub Actions secrets of `bea-technology/roxyon-devtools`.
- BaaS app keys for the data tools: each project's gitignored `.env`.
- Platform PAT for the `roxyon` CLI: `<project>/.roxyon-token.local` → `ROXYON_TOKEN`.
- Backend counterparts live in `/Users/Shared/www/_LB1/home/_configs` (`backend/` here is a reference copy).

### Related, done elsewhere
- `/_rxbase` ownership hole (KNOWN-ISSUES #17): fixed and deployed 2026-10-09 by another session
  (`_configs` 8d29c8c). Only the platform admin passes; a wider Privileges-based version was reverted (610fbca).
  The KNOWN-ISSUES row still says "uncommitted + undeployed" and needs updating.
