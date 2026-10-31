# @roxyon/cli

## 0.2.2

### Patch Changes

- Updated dependencies [0e81a98]
  - @roxyon/api-client@0.7.0
  - @roxyon/deploy-core@0.3.4

## 0.2.1

### Patch Changes

- Updated dependencies [90f79d7]
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
