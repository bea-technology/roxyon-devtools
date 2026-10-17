# @roxyon/api-client

## 0.4.0

### Minor Changes

- d516b4e: Add BaaS V2 data tools for the user's own app: `roxyon_baas_query`, `roxyon_baas_get`, `roxyon_baas_create`, `roxyon_baas_update`, `roxyon_baas_delete` and `roxyon_baas_batch`. They call `https://www.beaapis.com/2` (`/records`, `/batch`) as the app's backend with the secret key `RX_SECRET_KEY` (`rxsk_…`) from the project's `.env`, and run in the local (stdio) server only. Writes need `confirm:true`. New `BaasDataApi` in `@roxyon/api-client`.
- 1b42ced: Add read-only commerce tools: `roxyon_catalog` (public products with specs, USD list prices per cycle and stock), `roxyon_quote` (the exact checkout total for a new subscription, from the platform's own pricing, in the buyer's currency and tax), `roxyon_list_subscriptions` and `roxyon_list_invoices` (the caller's own, via the console's new `/account/subscriptions` and `/account/invoices`). Catalog and quote need no sign-in. New `BillingApi` in `@roxyon/api-client`.

### Patch Changes

- 90d6559: Add `roxyon_pay_link` (the console URL where the user pays one of their own open invoices; never charges). Invoices that can't be paid (paid, void, cancelled) no longer carry a pay link. New `isPayable()` / `PAYABLE_STATUSES` in `@roxyon/api-client`.

## 0.3.0

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

## 0.2.0

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

- 06b99dc: Stop surfacing internal infrastructure details (node ids, datacenter ids,
  container names, `/home/www/…` source paths) from `account.context()` /
  `account.apps()` and the `roxyon_whoami` output. A deploy only needs the
  subscription id/name/status and the host list.

## 0.1.1

### Patch Changes

- 89f9eec: fix: don't send X-BEA-Application-ID on authenticated requests — /Auth/login and /Auth/me were silently returning anon tokens, so roxyon login always failed
