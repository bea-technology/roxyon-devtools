# Release checklist — one-time distribution setup

The code and packages are done. This tracks the one-time steps to get Roxyon in
front of every AI assistant. Each is independent.

Status legend: ✅ done · 🔲 needs a web-UI action from BEA · ⏳ blocked

---

## 1. ✅ npm — OIDC trusted publishing

All five packages (`@roxyon/api-client`, `@roxyon/deploy-core`, `@roxyon/cli`,
`@roxyon/mcp`, `create-roxyon-app`) have a **Trusted Publisher** configured
(`bea-technology/roxyon-devtools` → `release.yml`) and 2FA enforced. Releases
publish with zero secrets — verified on the 0.1.1 release.

**Cutting a release afterwards:**
```bash
pnpm changeset            # describe changes, pick semver bumps
git commit -am "…" && git push
# → merge the "chore: version packages" PR the bot opens → it publishes
```

---

## 2. ✅ MCP registry

`io.github.bea-technology/roxyon` is **active** on
`registry.modelcontextprotocol.io` (currently `@roxyon/mcp@0.1.2`). GitHub OIDC
auth — no credentials. Every release keeps it in sync via the "Update MCP
registry" step in `release.yml`; manual re-run: Actions → "Publish to MCP
Registry".

Verify:
```bash
curl -s "https://registry.modelcontextprotocol.io/v0/servers?search=roxyon" \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).servers.map(s=>s.server.name+" "+s.server.version+" "+s.server.status).join("\n")'
```

---

## 3. Directory listings

**Auto-indexed from the MCP registry (step 2) — no action:** PulseMCP, mcp.so,
Glama. They crawl the registry; allow a day or two.

**`modelcontextprotocol/servers` — nothing to do.** That repo
[retired its third-party server list](https://github.com/modelcontextprotocol/servers/blob/main/CONTRIBUTING.md#server-listings)
in favour of the MCP registry and no longer accepts server-listing PRs. Step 2
*is* the replacement.

🔲 **Smithery** — `https://smithery.ai/new` → sign in with GitHub → add
`bea-technology/roxyon-devtools`, point it at `packages/mcp-server`. Smithery
builds and hosts an HTTP wrapper.

🔲 **Cursor MCP directory** — submission form linked from
`https://docs.cursor.com/tools`. Provide:
- Name: `Roxyon`
- Command: `npx -y @roxyon/mcp`
- Repo: `https://github.com/bea-technology/roxyon-devtools`
- Auth note: `roxyon login`, or set `ROXYON_TOKEN` to a `roxp_` PAT.

---

## 4. ✅/🔲 Claude Code plugin

Ready in-repo: `.claude-plugin/marketplace.json` +
`integrations/claude-code-plugin/` (plugin.json, `.mcp.json`, two slash commands,
the `roxyon` skill).

🔲 **Announce it.** Users add it with:
```
/plugin marketplace add bea-technology/roxyon-devtools
/plugin install roxyon
```
Put those two lines in the roxyon.com docs and the repo README's "Use from
Claude Code" section.

---

## 5. 🔲 ChatGPT Custom GPT

1. ChatGPT → **Explore GPTs** → **Create** → **Configure**.
2. **Name:** Roxyon · **Description:** first paragraph of
   `integrations/chatgpt-gpt/instructions.md`.
3. **Instructions:** paste `integrations/chatgpt-gpt/instructions.md` (drop the
   top "// note" line).
4. **Actions** → **Create new action**:
   - Schema: paste `integrations/chatgpt-gpt/actions-openapi.yaml`
     (validated — `redocly lint` passes).
   - Authentication: **API Key** → **Bearer**.
   - Optionally add a second Action from `docs/openapi/baas.yaml` for raw BaaS
     data ops.
5. **Save** → publish "Anyone with the link" (or submit to the store).
6. Users paste a `roxyon token create` PAT as the API key.

Binary source uploads (`roxyon deploy`) are deliberately **not** in the GPT
Action schema — that path needs the CLI or the MCP server.

---

## 6. ⏳ Host the knowledge-layer docs

**Blocked** until `roxyon.com` / `lumenjs.com` go live (coming-soon gated). When
they do:

```bash
./docs/publish-docs.sh          # stages llms.txt + openapi.yaml into the site repos
# review the diff in each site repo, then: lm build --serverless --deploy
```

Confirm:
```bash
curl -s https://roxyon.com/llms.txt
curl -s https://roxyon.com/openapi.yaml | head
curl -s https://lumenjs.com/llms.txt
curl -s https://lumenjs.com/llms/lumenjs.md | head
```

Until then the `llms.txt` URLs referenced in `AGENTS.md` / `server.json` /
`roxyon-baas.md` will 404 — harmless (docs pointers), fix on go-live.

---

## 7. ✅ End-to-end deploy test

Passed against live infrastructure: static site, PAT auth, Node app, logs, env.
Found and fixed two bugs (`c74d026` auth header, `f250a4c` gzip check). Re-run
any time:
```bash
roxyon login
roxyon token create smoke --scopes deploy,logs,read
npx create-roxyon-app@latest /tmp/rx-smoke -t lumen --host <a-domain-you-own> -y
cd /tmp/rx-smoke && ROXYON_TOKEN=roxp_… roxyon deploy
roxyon token revoke <id>
```

---

## Follow-ups (not blocking distribution)

- Provision a dedicated `roxyon-cli` BaaS app; replace the reused console public
  keys in `packages/api-client/src/constants.ts`.
- `rx whoami` prints the raw Datacenter id after each subscription — cosmetic.
- BaaS master key is still live in the deployed console (`migrate-pat.php` reads
  it from the node); rotate on the next BaaS update.
