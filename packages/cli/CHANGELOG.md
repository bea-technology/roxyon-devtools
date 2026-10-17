# @roxyon/cli

## 0.3.0

### Minor Changes

- d7bf7ba: `roxyon_order`: an agent places a new hosting/server order for the signed-in user (dry run = server quote + token budget; `confirm:true` creates the subscription and a pending invoice that a person pays). Hidden until the console's `POST /account/order` is live (`ROXYON_MCP_ORDERING=1` shows it). PAT scope `billing:order` with a monthly USD budget and allowed SKUs: `roxyon token create <name> --scopes billing:order --budget 50 --skus SCALE-S`. Tools whose console routes aren't live yet (databases, emails, SSH password, WordPress installer) are hidden unless `ROXYON_MCP_PROVISIONING=1`. A route that answers with a web page now gives a short "not available on this server yet" error.

### Patch Changes

- Updated dependencies [d7bf7ba]
  - @roxyon/api-client@0.6.0
  - @roxyon/deploy-core@0.3.3

## 0.2.0

### Minor Changes

- 0e6ccd0: Agent ordering: `roxyon_order` places a new hosting plan or cloud server for the signed-in user (dry run first with the exact quote and the token's budget, `confirm:true` to place it); the platform creates the subscription and a pending invoice, and a person pays at the returned link. Nothing is charged by the tool. Tokens made with the new `billing:order` scope carry a monthly USD budget and an optional SKU allow-list (`roxyon token create <name> --scopes billing:order --budget 50 --skus LAUNCH-S`), enforced server-side. New `BillingApi.order()` in `@roxyon/api-client`. The tool is hidden unless the server sets `ROXYON_MCP_ORDERING=1`.

### Patch Changes

- Updated dependencies [0e6ccd0]
- Updated dependencies [7e55387]
  - @roxyon/api-client@0.5.0
  - @roxyon/deploy-core@0.3.2

## 0.1.4

### Patch Changes

- Updated dependencies [d516b4e]
- Updated dependencies [1b42ced]
- Updated dependencies [90d6559]
  - @roxyon/api-client@0.4.0
  - @roxyon/deploy-core@0.3.1

## 0.1.3

### Patch Changes

- Updated dependencies [d6c111a]
  - @roxyon/api-client@0.3.0
  - @roxyon/deploy-core@0.3.0

## 0.1.2

### Patch Changes

- 06b99dc: Stop surfacing internal infrastructure details (node ids, datacenter ids,
  container names, `/home/www/…` source paths) from `account.context()` /
  `account.apps()` and the `roxyon_whoami` output. A deploy only needs the
  subscription id/name/status and the host list.
- Updated dependencies [e76cc01]
- Updated dependencies [06b99dc]
  - @roxyon/api-client@0.2.0
  - @roxyon/deploy-core@0.2.0

## 0.1.1

### Patch Changes

- Updated dependencies [89f9eec]
  - @roxyon/api-client@0.1.1
  - @roxyon/deploy-core@0.1.1
