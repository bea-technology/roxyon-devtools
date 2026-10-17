---
"@roxyon/mcp": minor
"@roxyon/api-client": minor
---

Database, mailbox and SSH-password tools are live: `roxyon_database_create`/`_delete`, `roxyon_list_databases`,
`roxyon_email_create`/`_delete`, `roxyon_list_emails`, `roxyon_ssh_reset_password` and `roxyon_install_wordpress`
are no longer hidden behind `ROXYON_MCP_PROVISIONING`. The two list calls now go through the console
(`POST /databases/list`, `/emails/list`), so they work with access tokens and OAuth connections.
