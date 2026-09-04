# @roxyon/cli

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
