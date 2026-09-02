# Release checklist — one-time distribution setup

The code and packages are done. These are the remaining one-time steps to get
Roxyon in front of every AI assistant. Most are web-UI clicks; each is
independent.

---

## 1. npm — OIDC trusted publishing (removes tokens from releases)

For **each** of the five packages
(`@roxyon/api-client`, `@roxyon/deploy-core`, `@roxyon/cli`, `@roxyon/mcp`,
`create-roxyon-app`):

1. Go to `https://www.npmjs.com/package/<name>` → **Settings** tab.
2. **Trusted Publisher** section → **GitHub Actions**.
3. Fill in:
   - Organization or user: `bea-technology`
   - Repository: `roxyon-devtools`
   - Workflow filename: `release.yml`
   - Environment: *(leave blank)*
4. Save.
5. Under **Publishing access** on the same page, select
   **"Require two-factor authentication and disallow bypass-2FA tokens"**.

Then delete the `NPM_TOKEN` repo secret if you added one (Settings → Secrets and
variables → Actions). Releases now publish with zero secrets.

**Cutting a release afterwards:**
```bash
pnpm changeset            # describe changes, pick semver bumps
git commit -am "…" && git push
# → merge the "chore: version packages" PR the bot opens → it publishes
```

---

## 2. MCP registry — first publish

The `io.github.bea-technology/roxyon` namespace authenticates via GitHub, so no
credentials to manage.

1. Push the two new workflow files (below) if not already: `git push`.
2. GitHub → **Actions** → **"Publish to MCP Registry"** → **Run workflow** →
   branch `main` → Run.
3. It fetches `mcp-publisher`, authenticates with GitHub OIDC, and publishes
   `integrations/mcp-registry/server.json`.
4. Verify: `curl -s https://registry.modelcontextprotocol.io/v0/servers?search=roxyon`

After this, every release auto-updates the registry (the `mcp-registry` job in
`release.yml`).

---

## 3. Directory listings

Several directories **auto-index from the official MCP registry** once step 2 is
done — no action needed for **PulseMCP**, **mcp.so**, **Glama** (they crawl the
registry; may take a day).

Manual submissions:

- **Smithery** — `https://smithery.ai/new` → connect the GitHub repo
  `bea-technology/roxyon-devtools`, point it at `packages/mcp-server`. Smithery
  builds and hosts it.
- **Cursor MCP directory** — `https://docs.cursor.com/tools` links to the
  submission form; provide the `npx -y @roxyon/mcp` command + repo URL.
- **`modelcontextprotocol/servers`** (the community README list) — open a PR
  adding a row under "Community Servers": name, `@roxyon/mcp`, one-line
  description, repo link.

---

## 4. Claude Code plugin marketplace

1. The repo already has `.claude-plugin/marketplace.json` and
   `integrations/claude-code-plugin/`.
2. Announce it — users add it with:
   ```
   /plugin marketplace add bea-technology/roxyon-devtools
   /plugin install roxyon
   ```
3. (Optional) submit to a public plugin-marketplace aggregator if/when one is
   relevant.

---

## 5. ChatGPT Custom GPT

1. ChatGPT → **Explore GPTs** → **Create** → **Configure**.
2. **Name:** Roxyon · **Description:** from `integrations/chatgpt-gpt/`.
3. **Instructions:** paste `integrations/chatgpt-gpt/instructions.md` (strip the
   top note).
4. **Actions** → **Create new action**:
   - Schema: paste `integrations/chatgpt-gpt/actions-openapi.yaml`
   - Authentication: **API Key** → **Custom** header name `Authorization`,
     value prefix `Bearer`
   - (add a second Action with `docs/openapi/baas.yaml` if you want BaaS data ops
     too)
5. **Save** → publish to "Anyone with the link" or the store.
6. Users paste a `roxyon token create` PAT as the API key.

---

## 6. Host the knowledge-layer docs

**Blocked** until `roxyon.com` / `lumenjs.com` go live (they're coming-soon
gated). When they do:

```bash
./docs/publish-docs.sh          # stages llms.txt + openapi.yaml into the site repos
# review the diff in each site repo, then: lm build --serverless --deploy
```

Then confirm:
```bash
curl -s https://roxyon.com/llms.txt
curl -s https://roxyon.com/openapi.yaml | head
curl -s https://lumenjs.com/llms.txt
curl -s https://lumenjs.com/llms/lumenjs.md | head
```

Until then, the `llms.txt` URLs referenced in `AGENTS.md` / `server.json` /
`roxyon-baas.md` will 404 — harmless (they're docs pointers), fix on go-live.

---

## 7. End-to-end deploy test

Once the backend is synced (done) and packages are published (done):

```bash
roxyon login                                          # your account
roxyon token create smoke --scopes deploy,logs,read   # copy the roxp_… value

# scratch project
npx create-roxyon-app@latest /tmp/rx-smoke -t lumen --host <a-domain-you-own> -y
cd /tmp/rx-smoke
ROXYON_TOKEN=roxp_… roxyon deploy

roxyon token revoke <id>                              # clean up
```

Expected: build runs, tarball uploads, the host serves the SPA. If anything
fails, the error points at which layer (build / upload / reconciler).
