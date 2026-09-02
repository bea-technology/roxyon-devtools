# Console backend additions

The CLI (`@roxyon/cli`) and, later, the MCP server need two new HTTP endpoints on
the console (the Swoole app that already serves `console.roxyon.com` and the
`/applications/*` endpoints). They are **not** part of this repo's build — this
directory holds the reference implementation and the deploy notes.

| Endpoint | Purpose | Auth | New in |
|---|---|---|---|
| `POST /applications/deploy` | Upload a source tarball for a Node/Python/PHP **application** → land in `SourcePath`, bump `ConfigRevision` | `X-BEA-Session-Token` (M1.5: `Authorization: Bearer roxp_…`) | M1 |
| `POST /sites/deploy` | Upload built static files for a **LumenJS / static site** → extract into the host's document root | same | M1 |

Both mirror the existing pattern in `libs/ApplicationAction.php`, `libs/ApplicationLogs.php`
and `libs/ApplicationRepo.php`:

1. `wsIdentify()` (or the PAT resolver) → the calling user.
2. Load the target row (`Applications` / `Domains`), assert its `Subscription`
   belongs to the caller.
3. Resolve `Subscription.Node`; run the filesystem work locally or over
   `ssh root@<nodeIP>` (the console is load-balanced across app-1/2/3, so the
   request may not land on the node that owns the container).
4. Do the work **inside the container** as the account user via
   `incus exec <container> -- su <user> -c …`, reading any stdin payload
   **first** (the `incus exec` stdin-drain gotcha).

## Files

- [`applications-deploy.md`](applications-deploy.md) — endpoint contract + validation rules
- [`ApplicationDeploy.php`](ApplicationDeploy.php) — reference handler (adapt to the console's helper names)
- [`app-source-apply.sh`](app-source-apply.sh) — extracts an uploaded tarball into a path inside the container
- [`sites-deploy.md`](sites-deploy.md) — static-site endpoint contract
- [`SitesDeploy.php`](SitesDeploy.php) — reference handler

## Deploying these to the nodes

Per the `_configs` workflow: edit in the console source checkout on a node (or
wherever the console PHP is version-controlled), then

```bash
scp libs/ApplicationDeploy.php  lb-1:/home/_configs/app-x/console/<path>
scp libs/SitesDeploy.php        lb-1:/home/_configs/app-x/console/<path>
scp app-x/console/sync.sh       lb-1:/home/_configs/app-x/console/sync.sh   # trigger, last
```

Verify `sha256sum` at Mac → lb-1 → node, watch
`/home/_configs/logs/processor.log` for `All nodes processed successfully`, then
confirm `supervisorctl status console` came back up on each app node.
