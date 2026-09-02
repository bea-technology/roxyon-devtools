---
description: Scaffold a new Roxyon project (LumenJS or Node)
argument-hint: "[name] [lumen|lumen-baas|node]"
---

Scaffold a new Roxyon project with `create-roxyon-app`.

- Args: `$ARGUMENTS` — first token is the directory name, second (optional) is the
  template (`lumen`, `lumen-baas`, or `node`). Ask me for anything missing.
- Run: `npx --yes create-roxyon-app <name> --template <template> --no-install`
- Then read the generated `AGENTS.md` and tell me the next steps.
- If it's a `lumen-baas` project, remind me to put my BaaS keys in
  `src/roxyon-baas.js`.
