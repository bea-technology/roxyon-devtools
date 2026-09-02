# AGENTS.md

> Template emitted by `create-roxyon-app` into every new project. Also works as
> `CLAUDE.md`, `GEMINI.md`, `.cursor/rules/`, `.github/copilot-instructions.md`.
> Replace the `<…>` placeholders.

This is a **<runtime>** project deployed on **Roxyon** (`roxyon.json` at the
root). Host: `<host>`.

## Framework

<!-- LumenJS projects: -->
This is a **LumenJS V1** SPA — vanilla JS/HTML/CSS, **no build step** for the
framework. `.view` files under `src/views/` are one-per-route. Read
https://lumenjs.com/llms/lumenjs.md before editing a view. The rules that bite:

- State is `var` in a `<script>` in the view, reactive only when named in a
  `bind="name"` on an ancestor.
- Never nest a `bind` inside another `bind` — the inner subtree stops rendering.
- `bind` interpolates descendants, not the element's own attributes.
- `:for` does not resolve the loop variable in nested loops or in plain
  attributes — build that markup as a JS string and `.html()` it in.
- A `{{ fn() }}` moustache runs once and goes stale — compute into a `var`.

## Backend

The Roxyon BaaS (`RX` engine), configured in `src/config.json` /
`<config location>`. Reference: https://roxyon.com/llms/baas.md. Key point:
**a failed write returns HTTP 200 with an `error` field** — check for it before
treating any create/update/delete as successful. The `in` operator wants a
comma-joined string, not an array.

## Deploy

Do **not** hand-edit files on the server or use SFTP. Deploy with:

```bash
roxyon deploy            # or the roxyon_deploy MCP tool (dry-run, then confirm:true)
```

- Static (LumenJS): `roxyon deploy` runs `<build command>` then publishes the
  output.
- App runtimes: source is uploaded and rebuilt in an isolated release dir.
- Environment variables live on the platform: `roxyon env set KEY=value`, then
  redeploy. Never set `PORT` or `HOST` — the platform owns them.
- Git push-to-deploy: `roxyon link <repo-url>`.

## Local dev

```bash
<dev command>            # e.g. lm serve
```
