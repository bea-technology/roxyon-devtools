# Recipe — install WordPress on Roxyon

The end-to-end flow for *"put WordPress on `blog.mycompany.com`"*. **Local /
CLI-backed MCP only** — `roxyon_install_wordpress` unpacks WordPress core into
a local scratch directory, which the hosted `mcp.roxyon.com` connector cannot
do (same restriction as `roxyon_init` / `roxyon_deploy`).

## The tool

`roxyon_install_wordpress` composes four steps into one call:

1. Create the host if it doesn't already exist (`roxyon_add_domain`'s own
   logic — a subdomain of a domain the account already hosts, or
   `*.roxyon.com`), with a PHP-capable vhost (`phpVersion`, default `8.3`).
2. Create a database (`roxyon_database_create` under the hood) — the name is
   derived from the host unless you pass `dbName`.
3. Download WordPress core and write a working `wp-config.php` against that
   database.
4. Upload it (the same tar path `roxyon_deploy` uses — WordPress core is
   thousands of files, well past `roxyon_deploy_content`'s JSON budget).

```
roxyon_install_wordpress { host: "blog.mycompany.com", confirm: true }
```

Dry-run first (omit `confirm`) to see the plan — which host, which database
name — before it provisions anything real.

## What comes back

The site URL, and the database name/username/password. **The password is
shown once** — nothing on the platform stores or re-shows it, so save it (or
hand it straight to the user) immediately.

## After the tool returns

WordPress itself still needs its famous "5-minute install" — site title, admin
account, language — the first time the URL is opened in a browser. The tool
does not automate that (it is a browser wizard, not an API); tell the user to
visit the URL to finish setup.

## v1 scope — what this does *not* do

- No plugin or theme selection — core only. Install extras the normal
  WordPress-admin way afterwards.
- No multisite.
- No existing-site import/migration — this is for a **new** install only.

## Notes

- `roxyon_database_create`'s name is a *suffix* — the platform prefixes it
  with the account's own username (the DB namespace is shared across every
  customer on the cluster), so `dbName: "blog"` becomes something like
  `acme_blog`, not `blog`.
- If the host already exists on the account, step 1 is a no-op (same
  behaviour as `roxyon_add_domain`) — safe to re-run against an existing host,
  though re-running the whole recipe will provision a **new** database each
  time (it does not detect "WordPress is already installed here").
