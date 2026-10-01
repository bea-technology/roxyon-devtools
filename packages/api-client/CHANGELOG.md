# @roxyon/api-client

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
