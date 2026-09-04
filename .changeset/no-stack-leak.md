---
"@roxyon/api-client": patch
"@roxyon/mcp": patch
"@roxyon/cli": patch
---

Stop surfacing internal infrastructure details (node ids, datacenter ids,
container names, `/home/www/…` source paths) from `account.context()` /
`account.apps()` and the `roxyon_whoami` output. A deploy only needs the
subscription id/name/status and the host list.
