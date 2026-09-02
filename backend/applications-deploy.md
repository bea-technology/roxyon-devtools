# `POST /applications/deploy`

Upload the source for an existing **application** and trigger a rebuild.

## Request

```
POST https://console.roxyon.com/applications/deploy
X-BEA-Session-Token: <session token>      # M1.5: Authorization: Bearer roxp_...
Content-Type: multipart/form-data
```

| field | type | notes |
|---|---|---|
| `application` | text | `Applications.objectId` |
| `archive` | file | gzip tarball of the project source (`.tar.gz`) |

The CLI builds `archive` from the project directory minus `.roxyonignore` /
`.gitignore` and an always-list (`node_modules`, `.git`, `.next`, `.venv`, …).

## Response

```jsonc
// 200
{ "ok": true, "application": "<objectId>", "configRevision": 7 }
// 4xx / 200 with error
{ "ok": false, "error": "human-readable reason" }
```

## Server behaviour

1. **Auth** — `wsIdentify()` → user. 401 → `{ error: "..." }`.
2. **Load + ownership** — fetch the `Applications` row (BaaS on the node private
   IP `:9000`); assert `row.Subscription` is one the user has a `Privileges` row
   for. Otherwise 403.
3. **Refuse git-managed apps** — if `RepoUrl` is set:
   `{ error: "This application deploys from its git remote. Push to <branch>, or disconnect the repo first." }`
4. **Receive + validate the archive** (stream to a temp file on the node that
   owns the container):
   - reject if larger than **512 MiB**;
   - reject if the gzip magic (`1f 8b`) is missing;
   - reject if it holds more than **20000 entries**;
   - normalise every entry path and reject the whole upload if any entry is
     absolute, contains `..`, or is a symlink/hardlink pointing outside the tree
     (`tar --restrict`, plus an explicit pre-scan).
5. **Apply** — `SourcePath` is `/home/www/<host>/public_html/<folder>` and is
   already constrained to the account tree by how it was created (`app_form.view`
   `updatePreview`). `mkdir -p "$SourcePath"`, then extract **over** it inside the
   container:

   ```
   incus exec <container> -- su <user> -c 'bash -s' < app-source-apply.sh \
       -- "<SourcePath>" "<tmp tarball path, already pushed into the container>"
   ```

   Extraction preserves `node_modules`, `.git`, `.venv` (rsync-style: the tarball
   is authoritative for everything it contains; those dirs are never in it and
   are left alone). See [`app-source-apply.sh`](app-source-apply.sh).
6. **Trigger the build** — `ConfigRevision = ConfigRevision + 1` on the row. The
   existing `ApplicationReconciler` picks it up, rsyncs `SourcePath` into a fresh
   `releases/<ts>/`, runs `npm ci && npm run build && npm prune --omit=dev`
   there, and swaps `current`. No new build path.
7. Respond `{ ok: true, application, configRevision }`.

## Notes

- This is the same `ConfigRevision` the console "Deploy" button and the git
  webhook bump — one reconciler path, so the regression surface is small.
- Do **not** touch `DesiredState`; a `stopped` app stays stopped and just gets
  new source for its next start.
- The upload replaces the whole tracked tree, so a file the user deleted locally
  disappears on deploy. That matches how `lm build --deploy` and git deploys
  behave.
