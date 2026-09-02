# backend/ — console + node changes for `roxyon deploy`

The `@roxyon/cli` and `@roxyon/mcp` `deploy` paths need two new console HTTP
endpoints and one new node script. **These files are the canonical copies** —
the deployed versions live in the Roxyon `_configs` tree:

| This repo | Deployed location (source of truth = `_configs`) |
|---|---|
| `ApplicationDeploy.php` | `_configs/app-x/console/clone/libs/ApplicationDeploy.php` |
| `SiteDeploy.php` | `_configs/app-x/console/clone/libs/SiteDeploy.php` |
| `app-source-apply.sh` | `_configs/x-x/scripts/clone/app-source-apply.sh` → `/usr/local/bin/` on every app node |

Status: **written and wired in `_configs/…/clone/`, not yet synced to the nodes.**

## What was changed in `_configs`

1. **`app-x/console/clone/libs/ApplicationDeploy.php`** (new) — `POST
   /applications/deploy?application=<id>`. Raw gzip body. Session auth via
   `wsIdentify`; caller must own the app's subscription. Rejects git-connected
   apps and stopped apps. Streams the archive to the app's node (ssh hop when
   it's not the node answering the request, same as `ApplicationLogs`), runs
   `app-source-apply.sh` to land it in `SourcePath`, then bumps `ConfigRevision`
   so the existing reconciler builds + releases it.

2. **`app-x/console/clone/libs/SiteDeploy.php`** (new) — `POST
   /sites/deploy?host=<domain>&folder=<sub-path>`. Raw gzip body. Session auth +
   `sslOwnedDomain` ownership check. Lands the archive in
   `/home/www/<host>/public_html[/<folder>]`. No build, no process — nginx
   serves it.

3. **`app-x/console/clone/core/server.php`** — `include` both libs; route
   `applications/deploy` inside the existing `applications` branch; new
   top-level `sites/deploy` branch.

4. **`app-x/console/clone/libs/server_setup.php`** — `'package_max_length' => 64
   * 1024 * 1024` on `$server->set([...])` so a source tarball body is not
   dropped (handlers cap at 64 MB).

5. **`app-x/console/clone/exec/worker.php`** — `'app-source-apply.sh' => 120` in
   `ALLOWED_SCRIPTS` (so a future reconciler job could call it too; the console
   calls it directly / over ssh today, needing no sudoers entry — same as
   `app-unit.sh`).

6. **`x-x/scripts/clone/app-source-apply.sh`** (new) — `app-source-apply.sh
   <container> <user> <dest-path>`, gzip tarball on stdin. Reads stdin first
   (incus drains it), refuses a dest outside `/home/www` and any archive with an
   absolute / `..` / symlink member, then `incus exec … su <user>` to extract
   with `--no-same-owner --no-overwrite-dir`, keeping `node_modules`/`.git`/
   `.venv`. Overlay semantics — does not delete files the archive omits (same
   contract as `app-git-sync.sh`). Prints `RX_FILES=<n>`.

7. **`x-x/scripts/sync.sh`** — scp + `chmod +x` `app-source-apply.sh`.

## To deploy (per the `_configs` workflow)

```
# console PHP:
scp _configs/app-x/console/clone/libs/ApplicationDeploy.php  lb-1:/home/_configs/app-x/console/clone/libs/
scp _configs/app-x/console/clone/libs/SiteDeploy.php          lb-1:/home/_configs/app-x/console/clone/libs/
scp _configs/app-x/console/clone/core/server.php              lb-1:/home/_configs/app-x/console/clone/core/
scp _configs/app-x/console/clone/libs/server_setup.php        lb-1:/home/_configs/app-x/console/clone/libs/
scp _configs/app-x/console/clone/exec/worker.php              lb-1:/home/_configs/app-x/console/clone/exec/
scp _configs/app-x/console/sync.sh                            lb-1:/home/_configs/app-x/console/    # trigger

# node script:
scp _configs/x-x/scripts/clone/app-source-apply.sh           lb-1:/home/_configs/x-x/scripts/clone/
scp _configs/x-x/scripts/sync.sh                             lb-1:/home/_configs/x-x/scripts/       # trigger
```

Then verify `sha256sum` Mac → lb-1 → node for each file and watch
`/home/_configs/logs/{console-sync,scripts-sync}.log`.

## Verify end to end

```bash
# tiny archive
mkdir -p /tmp/t && echo hi > /tmp/t/index.html && tar -czf /tmp/t.tgz -C /tmp/t .

# static
curl -sS -X POST "https://console.roxyon.com/sites/deploy?host=<yourhost>&folder=" \
  -H "X-BEA-Session-Token: $TOK" -H 'Content-Type: application/gzip' \
  --data-binary @/tmp/t.tgz
# -> {"ok":true,"host":"...","path":"/","files":1,...}

# app (needs an Applications row)
curl -sS -X POST "https://console.roxyon.com/applications/deploy?application=<id>" \
  -H "X-BEA-Session-Token: $TOK" -H 'Content-Type: application/gzip' \
  --data-binary @/tmp/t.tgz
# -> {"ok":true,"application":"<id>","configRevision":N,"files":1,...}

# path traversal is refused
tar -czf /tmp/bad.tgz -C /tmp --transform 's,^,../,' t/index.html
curl -sS -X POST ".../applications/deploy?application=<id>" -H ... --data-binary @/tmp/bad.tgz
# -> 502, log shows "Refusing unsafe archive members"
```
