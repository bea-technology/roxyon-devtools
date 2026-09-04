# @roxyon/deploy-core

## 0.2.0

### Minor Changes

- e76cc01: Add AI-native deploy tools to the hosted connector so an assistant can build a
  site in the conversation and put it online, no local CLI:
  
  - **`roxyon_add_domain`** — provision a subdomain of a domain the account already
    hosts (or `*.roxyon.com`): DNS + web server + automatic HTTPS.
  - **`roxyon_deploy_content`** — publish files passed as tool arguments (≤60 files,
    2 MB); `clean` replaces the docroot, `spa` flips deep-route routing to
    `index.html`.
  - **`roxyon_list_files`** / **`roxyon_read_file`** — inspect a live site to iterate.
  - `roxyon_list_domains` now shows `provisioning` state; a `roxyon://docs/recipe`
    resource + `build-and-ship-site` prompt walk the flow.
  
  `@roxyon/deploy-core` gains `packFiles()` (in-memory `{path,content}[]` → the same
  deterministic tarball); `@roxyon/api-client` gains `sites.listFiles/readFile`,
  `sites.deploy({clean,spa})` and `domains.create()`. `account.context()` no longer
  surfaces node/datacenter/container ids or `/home/www` paths.

### Patch Changes

- Updated dependencies [e76cc01]
- Updated dependencies [06b99dc]
  - @roxyon/api-client@0.2.0

## 0.1.1

### Patch Changes

- Updated dependencies [89f9eec]
  - @roxyon/api-client@0.1.1
