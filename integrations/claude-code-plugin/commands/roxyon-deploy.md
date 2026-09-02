---
description: Deploy the current project to Roxyon (dry run first, then confirm)
---

Deploy the project in the current working directory to Roxyon.

1. If there is no `roxyon.json`, call the `roxyon_init` MCP tool (it detects the
   runtime). If the account has more than one host, ask me which to use.
2. Call `roxyon_deploy` with just the directory to get the dry-run plan. Show it
   to me.
3. If I confirm, call `roxyon_deploy` again with `confirm: true`.
4. For an app runtime, report the final status. If it failed, show the last
   error from `roxyon_app_status`.

Do not SFTP files or edit anything on the server — the MCP tools are the only
deploy path.
