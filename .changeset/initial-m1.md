---
"@roxyon/api-client": minor
"@roxyon/cli": minor
---

M1: initial release.

- `@roxyon/api-client` — typed client for the Roxyon BaaS (`RX` engine): anon
  token minting, email/password + OTP login, subscriptions, domains,
  Applications CRUD, and the console deploy/logs/action/repo endpoints. Ports
  `rxError` (resolve-on-failure writes) and the `.env` parse/format helpers.
- `@roxyon/cli` (`roxyon`) — `login`, `logout`, `whoami`, `init`, `deploy`,
  `logs`, `env pull|set|rm`, `restart`, `open`, `link`. Detects LumenJS / Node /
  Python / PHP projects, runs the local build, archives with `.roxyonignore`
  support, and streams the build while it goes live.
