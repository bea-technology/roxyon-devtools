# Deploying to Roxyon — reference for AI models

Use the MCP tools (`roxyon_init`, then `roxyon_deploy`) rather than calling the
API directly. This explains what they do.

## Two deploy kinds

| Kind | For | How it serves |
|---|---|---|
| `static` | LumenJS SPAs (`lm build --serverless`), any static output | Files extracted into the host's document root, served by nginx. No process. |
| `app` | Node.js / Python / PHP apps | An `Applications` row + a systemd unit. Source is uploaded, `ConfigRevision` is bumped, a reconciler builds it in an isolated release directory and runs it. |

## `roxyon.json`

Written by `roxyon_init` at the project root:

```jsonc
{
  "name": "my-app",
  "application": "AbC123dEf0",   // Applications.objectId — set after first app deploy
  "host": "example.com",          // a Domains.Name on the subscription
  "folder": "",                   // sub-path under the host; "" = root
  "runtime": "lumen",             // lumen | node | python | php
  "kind": "static",               // static (lumen) | app
  "build": "lm build --serverless",
  "outDir": "dist",
  "start": "npm run start",       // app kind only
  "public": true                  // app kind only — serve the app on the host
}
```

## The deploy sequence (`roxyon_deploy`)

1. Load `roxyon.json`; resolve the caller's subscription and the target host.
2. Run `build` if set (LumenJS → `lm build --serverless`).
3. Archive the project (or `outDir`) minus `node_modules`, `.git`, build caches,
   and `.roxyonignore` / `.gitignore` matches. The archive is deterministic.
4. **static** → `POST /sites/deploy` (host + folder + tarball).
   **app** → create the `Applications` / `ApplicationProcesses` /
   `ApplicationRoutes` rows on the first deploy, then `POST /applications/deploy`
   (tarball) which lands it in `SourcePath` and bumps `ConfigRevision`.
5. For `app`, poll `roxyon_app_status` / stream `roxyon_logs` until the status is
   `running` (done) or `failed` (`LastError` explains why).

## Environment variables

Live on the platform, not in `roxyon.json`. `roxyon_env_set` merges them and
bumps the revision; the next `roxyon_deploy` applies them. `PORT` and `HOST` are
set by the platform — never set them.

## Git push-to-deploy

`roxyon_link_github` connects a repo: it returns a deploy key and a webhook URL.
Add both to the repo and pushes to the chosen branch redeploy automatically. A
git-connected app rejects tarball uploads — push instead.

## Beyond deploy: databases, email, SSH

The Applications/Sites system above is only part of the platform. These tools
cover the rest — each is a small provision-and-return-once action, not a
project you iterate on:

| Tool | Does |
|---|---|
| `roxyon_database_create` / `roxyon_list_databases` / `roxyon_database_delete` | A MySQL/MariaDB database + user on the shared Galera cluster. The name you pass is a *suffix* — the platform prefixes it with the account's own username, since the DB namespace is shared platform-wide. Returns `{username, password, host}` — the password is shown **once**, capture it immediately. |
| `roxyon_email_create` / `roxyon_list_emails` / `roxyon_email_delete` | A mailbox on a host already on the account. Password shown once, same as databases. |
| `roxyon_ssh_reset_password` | Resets the **one shared shell password** for a subscription's container — used for SSH, SFTP, *and* the file manager. Resetting it signs out anything using the old one. Shown once; the platform never stores or re-shows it. |
| `roxyon_install_wordpress` | Composes the above: create/reuse a host → create a database → download WordPress core → deploy it. Local-filesystem-only (needs somewhere to unpack WordPress), same restriction as `roxyon_init`/`roxyon_deploy`. See the `roxyon://docs/recipe-wordpress` resource. |

`roxyon_add_domain` also takes an optional `phpVersion` (e.g. `"8.3"`) — pass it
when the host will run a PHP app (WordPress or otherwise); omitted, the
platform defaults to its own current default version.

## LumenJS specifics

- No build step for the framework; `.view` files are HTML+JS+CSS interpreted in
  the browser. `lm build --serverless` just bundles + minifies for production.
- V1 rendering gotchas (see the `lumenjs` resource): a `bind` inside another
  `bind` silently stops rendering; `:for` does not resolve the loop variable in
  nested loops or in an element's own non-backtick attributes; a moustache
  function call is evaluated once and goes stale.
