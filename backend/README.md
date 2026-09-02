# backend/ — console + node changes for `roxyon deploy`

The `@roxyon/cli` and `@roxyon/mcp` `deploy` paths need two new console HTTP
endpoints and one new node script. **These files are the canonical copies** —
the deployed versions live in the Roxyon `_configs` tree:

| This repo | Deployed location (source of truth = `_configs`) |
|---|---|
| `ApplicationDeploy.php` | `_configs/app-x/console/clone/libs/ApplicationDeploy.php` |
| `SiteDeploy.php` | `_configs/app-x/console/clone/libs/SiteDeploy.php` |
| `AccountTokens.php` | `_configs/app-x/console/clone/libs/AccountTokens.php` — PAT management |
| `AccountContext.php` | `_configs/app-x/console/clone/libs/AccountContext.php` — one PAT-safe context call |
| `migrate-pat.php` | `_configs/app-x/console/clone/exec/migrate-pat.php` — run once on a node |
| `app-source-apply.sh` | `_configs/x-x/scripts/clone/app-source-apply.sh` → `/usr/local/bin/` on every app node |

Plus in `core/server.php`: `patIdentify()` + `apiCaller()` helpers (accept
`Authorization: Bearer roxp_…` alongside `X-BEA-Session-Token`), and routing for
`applications/deploy`, `sites/deploy`, `account/tokens`, `account/context`.

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
CL=_configs/app-x/console/clone
# console PHP (new + modified):
scp $CL/libs/{ApplicationDeploy,SiteDeploy,AccountTokens,AccountContext,ApplicationAction,ApplicationLogs,server_setup}.php  lb-1:/home/_configs/app-x/console/clone/libs/
scp $CL/core/server.php   lb-1:/home/_configs/app-x/console/clone/core/
scp $CL/exec/{worker,migrate-pat}.php  lb-1:/home/_configs/app-x/console/clone/exec/
scp _configs/app-x/console/sync.sh   lb-1:/home/_configs/app-x/console/    # trigger

# node script:
scp _configs/x-x/scripts/clone/app-source-apply.sh  lb-1:/home/_configs/x-x/scripts/clone/
scp _configs/x-x/scripts/sync.sh   lb-1:/home/_configs/x-x/scripts/       # trigger
```

Then verify `sha256sum` Mac → lb-1 → node for each file, watch
`/home/_configs/logs/{console-sync,scripts-sync}.log`, and **run the migration
once** on any app node:

```
ssh lb-1 'ssh root@10.0.0.2 "php /var/www/console/exec/migrate-pat.php"'
```

## Verify end to end

```bash
mkdir -p /tmp/t && echo hi > /tmp/t/index.html && tar -czf /tmp/t.tgz -C /tmp/t .

# --- with a session token (browser login) ---
TOK=<session token>

# create a PAT, then use it for everything else
curl -sS -X POST https://console.roxyon.com/account/tokens \
  -H "X-BEA-Session-Token: $TOK" -H 'Content-Type: application/json' \
  -d '{"name":"test","scopes":["deploy","logs","read"]}'
# -> {"ok":true,"token":"roxp_…", ...}
PAT=roxp_…

# --- everything below works with the PAT ---
curl -sS https://console.roxyon.com/account/context -H "Authorization: Bearer $PAT"
# -> {"ok":true,"user":{...},"subscriptions":[...],"domains":[...]}

# static
curl -sS -X POST "https://console.roxyon.com/sites/deploy?host=<yourhost>&folder=" \
  -H "Authorization: Bearer $PAT" -H 'Content-Type: application/gzip' --data-binary @/tmp/t.tgz
# -> {"ok":true,"host":"...","path":"/","files":1,...}

# app — first call CREATES it (no ?application=)
curl -sS -X POST "https://console.roxyon.com/applications/deploy?host=<yourhost>&folder=demo&runtime=node" \
  -H "Authorization: Bearer $PAT" -H 'Content-Type: application/gzip' --data-binary @/tmp/t.tgz
# -> {"ok":true,"application":"<newid>","created":true,"configRevision":1,...}

# path traversal is refused
tar -czf /tmp/bad.tgz -C /tmp --transform 's,^,../,' t/index.html
curl -sS -X POST ".../sites/deploy?host=<yourhost>" -H "Authorization: Bearer $PAT" \
  -H 'Content-Type: application/gzip' --data-binary @/tmp/bad.tgz
# -> 502, log shows "Refusing unsafe archive members"

# a token without the scope is refused
curl -sS -X POST ".../applications/deploy?host=x&runtime=node" \
  -H "Authorization: Bearer <read-only PAT>" --data-binary @/tmp/t.tgz
# -> 403 "does not have the \"deploy\" scope"
```
