# @roxyon/api-client

Typed TypeScript client for the **Roxyon BaaS** (the `RX` engine) and the Roxyon
console's deploy endpoints. Plain `fetch`, no browser dependency — works in Node,
the edge, and the browser.

```bash
npm i @roxyon/api-client
```

```ts
import { Roxyon } from '@roxyon/api-client';

// A session token from `roxyon login`, or a roxp_ personal access token.
const roxyon = new Roxyon({ sessionToken: process.env.ROXYON_TOKEN });

const ctx = await roxyon.account.context();      // user + subscriptions + domains
const apps = await roxyon.account.apps();
const logs = await roxyon.applications.logs(apps[0].id, 100);
```

## What's in it

- `auth` — `/Auth/*` login (email+password, OTP step-up), `me`, `logout`
- `account` — `context()` (user + subs + domains), `apps()`, `getApp()`
- `applications` — `uploadSource()` (deploy), `deploy`/`restart`, `logs`,
  `getEnv`/`setEnv`, `repoConnect` (git push-to-deploy)
- `sites` — static-site publish
- `tokens` — personal access token create / list / revoke
- `RUNTIMES`, `rxError`, `parseEnv`/`formatEnv`, `toQueryString`

## Notes

- A `roxp_…` token authenticates the **console** endpoints (`Authorization:
  Bearer`); it is not a BaaS session token — resolve identity and subscriptions
  through `account.context()`.
- The BaaS **resolves a failed write** with an `error` field rather than
  rejecting. The write helpers here check for it and throw `RoxyonApiError`.

MIT · part of [roxyon-devtools](https://github.com/bea-technology/roxyon-devtools)
