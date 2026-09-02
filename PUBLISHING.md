# Publishing

Six things ship from this repo:

| npm | what |
|---|---|
| `@roxyon/api-client` | typed BaaS + deploy client |
| `@roxyon/deploy-core` | shared deploy pipeline |
| `@roxyon/cli` (`roxyon`) | the CLI |
| `@roxyon/mcp` (`roxyon-mcp`) | the MCP server |
| `create-roxyon-app` | scaffolder |

Plus `integrations/mcp-registry/server.json` → the **MCP registry**.

## 0.1.0 — already published (2026-09-02)

All five packages are live at `0.1.0` under the `roxyon` npm org
(maintainer `bea.technology`). If you ever need to redo a first publish
manually:

```bash
npm login
pnpm install && pnpm -r build && pnpm -r test
pnpm -r publish --access public --no-git-checks
```

Use **`pnpm publish`, never `npm publish`** — only pnpm rewrites the
`workspace:*` dep ranges. And set the npm org's **default package visibility to
Public** (`npmjs.com/settings/roxyon/package-settings`) or scoped packages
publish private.

## Every release after this one — automated

`.github/workflows/release.yml` runs on push to `main`:

1. Pending changesets → opens/updates a **"Version Packages" PR**.
2. Merge that PR → the workflow bumps versions, writes CHANGELOGs, and
   **publishes to npm** and **updates the MCP registry**.

No tokens if you set up **OIDC trusted publishing** (recommended):

- npm: each package → Settings → **Trusted Publisher** → GitHub Actions,
  repo `bea-technology/roxyon-devtools`, workflow `release.yml`.
- MCP registry: nothing to configure — the workflow authenticates with GitHub
  OIDC for the `io.github.bea-technology/*` namespace.

Fallback if you skip OIDC: add an `NPM_TOKEN` repo secret (granular, write to the
`@roxyon` scope + `create-roxyon-app`) — the workflow picks it up.

### Cutting a release

```bash
pnpm changeset          # describe the change, pick bump levels
git add -A && git commit -m "…" && git push
# → merge the "Version Packages" PR the bot opens
```

## Notes

- `@roxyon/api-client`'s `constants.ts` embeds the console's **public** App-ID +
  JavaScript-Key. Swap for a dedicated `roxyon-cli` BaaS app when one exists —
  not a breaking change.
- `@roxyon/mcp` ships `resources/lumenjs.md` (~91 KB, the full LumenJS
  reference) as an MCP resource — intentional.
