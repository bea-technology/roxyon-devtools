# @roxyon/deploy-core

The shared deploy pipeline behind [`@roxyon/cli`](https://www.npmjs.com/package/@roxyon/cli)
and [`@roxyon/mcp`](https://www.npmjs.com/package/@roxyon/mcp): project-type
detection, deterministic archiving, and the build → upload → poll orchestration.
You normally use the CLI or the MCP server, not this directly.

```bash
npm i @roxyon/deploy-core
```

```ts
import { Roxyon } from '@roxyon/api-client';
import { deployProject } from '@roxyon/deploy-core';

const outcome = await deployProject({
  cwd: process.cwd(),
  roxyon: new Roxyon({ sessionToken: process.env.ROXYON_TOKEN }),
  reporter: { step: console.log, log: console.log },
});
```

## Exports

- `deployProject()` — reads `roxyon.json`, builds if configured, packs (minus
  `.roxyonignore` / `.gitignore`), uploads, and for app runtimes polls until the
  deploy is live or failed. The console creates the application on the first
  deploy.
- `detectRuntime()` / `buildProjectConfig()` — for `roxyon init`
- `packDirectory()` / `buildIgnore()` / `listFiles()` — the archiver
- `loadProjectConfig()` / `saveProjectConfig()` — `roxyon.json`
- `loadCredentials()` / `saveCredentials()` — `~/.roxyon/config.json`

MIT · part of [roxyon-devtools](https://github.com/bea-technology/roxyon-devtools)
