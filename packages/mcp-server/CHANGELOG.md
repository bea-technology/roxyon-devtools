# @roxyon/mcp

## 0.6.0

### Minor Changes

- 0e6ccd0: Agent ordering: `roxyon_order` places a new hosting plan or cloud server for the signed-in user (dry run first with the exact quote and the token's budget, `confirm:true` to place it); the platform creates the subscription and a pending invoice, and a person pays at the returned link. Nothing is charged by the tool. Tokens made with the new `billing:order` scope carry a monthly USD budget and an optional SKU allow-list (`roxyon token create <name> --scopes billing:order --budget 50 --skus LAUNCH-S`), enforced server-side. New `BillingApi.order()` in `@roxyon/api-client`. The tool is hidden unless the server sets `ROXYON_MCP_ORDERING=1`.

### Patch Changes

- Updated dependencies [0e6ccd0]
- Updated dependencies [7e55387]
  - @roxyon/api-client@0.5.0
  - @roxyon/deploy-core@0.3.2

## 0.5.0

### Minor Changes

- d516b4e: Add BaaS V2 data tools for the user's own app: `roxyon_baas_query`, `roxyon_baas_get`, `roxyon_baas_create`, `roxyon_baas_update`, `roxyon_baas_delete` and `roxyon_baas_batch`. They call `https://www.beaapis.com/2` (`/records`, `/batch`) as the app's backend with the secret key `RX_SECRET_KEY` (`rxsk_…`) from the project's `.env`, and run in the local (stdio) server only. Writes need `confirm:true`. New `BaasDataApi` in `@roxyon/api-client`.
- 1b42ced: Add read-only commerce tools: `roxyon_catalog` (public products with specs, USD list prices per cycle and stock), `roxyon_quote` (the exact checkout total for a new subscription, from the platform's own pricing, in the buyer's currency and tax), `roxyon_list_subscriptions` and `roxyon_list_invoices` (the caller's own, via the console's new `/account/subscriptions` and `/account/invoices`). Catalog and quote need no sign-in. New `BillingApi` in `@roxyon/api-client`.
- 90d6559: Add `roxyon_pay_link` (the console URL where the user pays one of their own open invoices; never charges). Invoices that can't be paid (paid, void, cancelled) no longer carry a pay link. New `isPayable()` / `PAYABLE_STATUSES` in `@roxyon/api-client`.

### Patch Changes

- d516b4e: Pin LumenJS to `@lmjs/cli@2.5.7`, the current V2 release: new LumenJS projects scaffold with it, and the MCP docs/prompts point at `npx -y -p @lmjs/cli@2.5.7 lm …` plus `lm update-core` for existing projects.
- Updated dependencies [d516b4e]
- Updated dependencies [1b42ced]
- Updated dependencies [90d6559]
  - @roxyon/api-client@0.4.0
  - @roxyon/deploy-core@0.3.1

## 0.4.0

### Minor Changes

- d6c111a: Add database, email, and SSH/SFTP password provisioning, and a WordPress
  installer recipe — the connector now covers cloud hosting beyond the
  Applications system.
  
  - `@roxyon/api-client`: `DatabasesApi`, `EmailApi`, `SshApi`; `DomainsApi.create()`
    takes an optional `phpVersion`.
  - `@roxyon/deploy-core`: `installWordPress()` (download WordPress core + write
    `wp-config.php` against a database; does not deploy — pack + `sites.deploy()`
    separately).
  - `@roxyon/mcp`: `roxyon_database_create` / `roxyon_list_databases` /
    `roxyon_database_delete`, `roxyon_email_create` / `roxyon_list_emails` /
    `roxyon_email_delete`, `roxyon_ssh_reset_password`, `roxyon_install_wordpress`;
    `roxyon_add_domain` gained `phpVersion`; new `roxyon://docs/recipe-wordpress`
    resource and `install-wordpress` prompt.
  
  FTP account management is intentionally not included — the console has FTP UI
  and BaaS rows for it, but no backend ever provisions them; left for a future,
  dedicated pass rather than building against a feature that doesn't work yet.

### Patch Changes

- Updated dependencies [d6c111a]
  - @roxyon/api-client@0.3.0
  - @roxyon/deploy-core@0.3.0

## 0.3.0

### Minor Changes

- e76cc01: Add AI-native deploy tools to the hosted connector so an assistant can build a
  site in the conversation and put it online, no local CLI:
  
  - **`roxyon_add_domain`** — provision a subdomain of a domain the account already
    hosts (or `*.roxyon.com`): DNS + web server + automatic HTTPS.
  - **`roxyon_deploy_content`** — publish files passed as tool arguments (≤60 files,
    2 MB); `clean` replaces the docroot, `spa` flips deep-route routing to
    `index.html`.
  - **`roxyon_list_files`** / **`roxyon_read_file`** — inspect a live site to iterate.
  - `roxyon_list_domains` now shows `provisioning` state; a `roxyon://docs/recipe`
    resource + `build-and-ship-site` prompt walk the flow.
  
  `@roxyon/deploy-core` gains `packFiles()` (in-memory `{path,content}[]` → the same
  deterministic tarball); `@roxyon/api-client` gains `sites.listFiles/readFile`,
  `sites.deploy({clean,spa})` and `domains.create()`. `account.context()` no longer
  surfaces node/datacenter/container ids or `/home/www` paths.

### Patch Changes

- 327117c: Advertise the hosted **`https://mcp.roxyon.com/mcp`** endpoint as a
  `streamable-http` remote in the MCP registry entry, so OAuth-capable clients
  (claude.ai, ChatGPT, Cursor) can connect without installing anything. The stdio
  package entry is unchanged.
- 06b99dc: Stop surfacing internal infrastructure details (node ids, datacenter ids,
  container names, `/home/www/…` source paths) from `account.context()` /
  `account.apps()` and the `roxyon_whoami` output. A deploy only needs the
  subscription id/name/status and the host list.
- Updated dependencies [e76cc01]
- Updated dependencies [06b99dc]
  - @roxyon/api-client@0.2.0
  - @roxyon/deploy-core@0.2.0

## 0.2.0

### Minor Changes

- e1a20a2: Add a remote **Streamable HTTP** transport (`roxyon-mcp-http` bin) alongside the
  stdio server. It exposes RFC 9728 / RFC 8414 OAuth discovery, requires a bearer
  token (audience-checked RFC 7662 introspection in `MCP_AUTH=introspect` mode),
  and serves each request with a fresh stateless transport. The nine API-shaped
  tools work remotely; `roxyon_init` / `roxyon_deploy` return a "use the CLI
  locally / `roxyon_link_github`" message since they need the caller's filesystem.

## 0.1.2

### Patch Changes

- Updated dependencies [89f9eec]
  - @roxyon/api-client@0.1.1
  - @roxyon/deploy-core@0.1.1
