# `roxyon.json`

Per-project config, at the project root. Written by `roxyon init`; the
`application` field is filled in on the first `app`-kind deploy.

```jsonc
{
  "name": "my-app",                 // display name / default application name
  "application": "AbC123dEf0",       // Applications.objectId — set after first deploy (app kind)
  "host": "example.com",             // Domains.Name on your subscription
  "folder": "",                      // sub-path under the host; "" = root
  "runtime": "lumen",                // lumen | node | python | php
  "runtimeVersion": "20.20.2",       // app kind only
  "preset": "node",                  // app kind only — framework preset
  "kind": "static",                  // static (lumen) | app (node/python/php)
  "build": "lm build --serverless",  // local build command; "" for server runtimes
  "outDir": "dist",                  // where the build writes (static kind)
  "start": "npm run start",          // web-process start command (app kind)
  "public": true                     // serve the app on the host (app kind)
}
```

## Ignore rules

`roxyon deploy` archives the project (or `outDir`) minus:

1. an always-list: `node_modules`, `.git`, `.next`, `.nuxt`, `.venv`,
   `__pycache__`, `.DS_Store`, `.roxyon`, `dist/.cache`;
2. `.roxyonignore` if present, else `.gitignore` (gitignore syntax).

## Environment

Env vars live on the platform, not in `roxyon.json`:

```bash
roxyon env set DATABASE_URL=... API_KEY=...
roxyon env pull
roxyon deploy            # applies pending env changes
```

`PORT` and `HOST` are set by the platform — don't set them.
