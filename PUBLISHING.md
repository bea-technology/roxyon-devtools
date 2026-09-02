# Publishing

Five packages ship to npm under the **`roxyon`** org (plus the unscoped
`create-roxyon-app`):

| Package | bin |
|---|---|
| `@roxyon/api-client` | — |
| `@roxyon/deploy-core` | — |
| `@roxyon/cli` | `roxyon` |
| `@roxyon/mcp` | `roxyon-mcp` |
| `create-roxyon-app` | `create-roxyon-app` |

## First release (0.1.0)

```bash
# 1. auth — a member of the `roxyon` npm org
npm login

# 2. clean build + full check
pnpm install
pnpm -r build && pnpm -r typecheck && pnpm -r test && pnpm lint

# 3. publish, in dependency order, with workspace:* rewritten to real versions
pnpm -r publish --access public
#   add --otp=123456 if the org requires 2FA
#   add --no-git-checks if publishing from a dirty/branch checkout
```

**Use `pnpm publish`, not `npm publish`** — only pnpm rewrites the `workspace:*`
dependency ranges to the actual published versions. `npm publish` would ship
`"@roxyon/api-client": "workspace:*"` verbatim and every install would break.

`prepublishOnly` runs `tsup` for each package, so step 2's build is belt-and-braces.

## Verify

```bash
npm view @roxyon/cli
npx --yes @roxyon/cli@latest --help
npx --yes create-roxyon-app@latest --help
npx --yes @roxyon/mcp@latest --version
```

## Subsequent releases

Use changesets:

```bash
pnpm changeset            # describe the change, pick bump levels
pnpm changeset version    # bumps versions + writes CHANGELOGs
git commit -am "Version packages"
pnpm -r build && pnpm -r publish
```

## Notes

- `@roxyon/api-client`'s `constants.ts` embeds the console's **public** App-ID +
  JavaScript-Key (they ship in `console.roxyon.com`'s browser bundle). There's a
  TODO to provision a dedicated `roxyon-cli` BaaS app; swap them there when it
  exists — no breaking change for consumers.
- `@roxyon/mcp` ships `resources/lumenjs.md` (~91 KB) — the full LumenJS
  reference, served as an MCP resource. Intentional.
