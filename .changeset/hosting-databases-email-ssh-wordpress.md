---
"@roxyon/api-client": minor
"@roxyon/deploy-core": minor
"@roxyon/mcp": minor
---

Add database, email, and SSH/SFTP password provisioning, and a WordPress
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
