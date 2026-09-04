# @roxyon/mcp

## 0.3.0

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

- 327117c: Advertise the hosted **`https://mcp.roxyon.com/mcp`** endpoint as a
  `streamable-http` remote in the MCP registry entry, so OAuth-capable clients
  (claude.ai, ChatGPT, Cursor) can connect without installing anything. The stdio
  package entry is unchanged.
- 06b99dc: Stop surfacing internal infrastructure details (node ids, datacenter ids,
  container names, `/home/www/…` source paths) from `account.context()` /
  `account.apps()` and the `roxyon_whoami` output. A deploy only needs the
  subscription id/name/status and the host list.
- Updated dependencies [e76cc01]
- Updated dependencies [06b99dc]
  - @roxyon/api-client@0.2.0
  - @roxyon/deploy-core@0.2.0

## 0.2.0

### Minor Changes

- e1a20a2: Add a remote **Streamable HTTP** transport (`roxyon-mcp-http` bin) alongside the
  stdio server. It exposes RFC 9728 / RFC 8414 OAuth discovery, requires a bearer
  token (audience-checked RFC 7662 introspection in `MCP_AUTH=introspect` mode),
  and serves each request with a fresh stateless transport. The nine API-shaped
  tools work remotely; `roxyon_init` / `roxyon_deploy` return a "use the CLI
  locally / `roxyon_link_github`" message since they need the caller's filesystem.

## 0.1.2

### Patch Changes

- Updated dependencies [89f9eec]
  - @roxyon/api-client@0.1.1
  - @roxyon/deploy-core@0.1.1
