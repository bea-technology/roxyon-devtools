---
name: roxyon
description: >
  Build and deploy on Roxyon — LumenJS SPAs, the Roxyon BaaS, and app/web
  deploys. Use when the user mentions Roxyon, LumenJS, a `roxyon.json`, or asks
  to deploy a project that has one.
---

# Roxyon

Roxyon is an app-hosting platform with a built-in Backend-as-a-Service. The
`roxyon` MCP server (bundled with this plugin) does the work — don't shell out to
`sftp`, `scp`, or edit files on a server.

## Deploying

1. `roxyon_init { dir }` once per project — writes `roxyon.json` (detects the
   runtime; ask which host if there are several).
2. `roxyon_deploy { dir }` — returns a dry-run plan.
3. `roxyon_deploy { dir, confirm: true }` — builds, uploads, and for app
   runtimes waits until it's live. The first deploy creates the application.
4. `roxyon_app_status` / `roxyon_logs` to check on it. `roxyon_env_set` +
   redeploy for environment variables (`PORT`/`HOST` are platform-managed).

## Writing LumenJS

Read the `roxyon://docs/lumenjs` MCP resource first. V1 rules that bite:

- State is `var` in a `<script>` in the view, reactive only when named in a
  `bind="name"` on an ancestor.
- Never nest a `bind` in another `bind` — the inner subtree stops rendering.
- `:for` doesn't resolve the loop variable in nested loops or plain attributes —
  build that markup as a JS string.
- A `{{ fn() }}` moustache runs once and goes stale.

## Using the BaaS

Read `roxyon://docs/baas`. The one that bites: **a failed write returns HTTP 200
with an `error` field** — check for it before assuming a write succeeded.

## Auth

The MCP server uses the login from `roxyon login`, or `ROXYON_TOKEN` (a
`roxp_…` personal access token, `roxyon token create`).
