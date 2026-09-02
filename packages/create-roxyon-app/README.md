# create-roxyon-app

Scaffold a Roxyon project that's ready for `roxyon deploy` and legible to any AI
assistant.

```bash
npm create roxyon-app@latest my-app
# or
npx create-roxyon-app my-app --template lumen-baas --host my-domain.com
```

## Templates

| id | what |
|---|---|
| `lumen` | LumenJS SPA (vanilla JS/HTML/CSS, no build step) |
| `lumen-baas` | LumenJS SPA wired to the Roxyon BaaS — RX SDK, `rxError()` helper, an auth-free data example (`items.view`) |
| `node` | Minimal Node.js HTTP server (no deps), reads `PORT`/`HOST` from the environment |

LumenJS templates are scaffolded by `@lmjs/cli` under the hood, then overlaid —
so they always track the current framework.

## What every project gets

- `roxyon.json` — host, folder, runtime, build command
- **`AGENTS.md`** — how to build and deploy this project, plus the LumenJS V1 /
  BaaS gotchas. Also written as `CLAUDE.md`, `GEMINI.md`,
  `.cursor/rules/roxyon.mdc`, `.github/copilot-instructions.md`
- `llms.txt` — pointers to the framework + platform docs
- `.roxyonignore`, `.gitignore`
- npm scripts: `dev`, `build`, `deploy`

## Flags

```
-t, --template <id>    lumen | lumen-baas | node
    --host <domain>     deploy host (a domain on your Roxyon subscription)
    --folder <path>     sub-path under the host
    --no-install        skip npm install
-y, --yes              accept defaults, no prompts
```
