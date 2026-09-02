# `POST /sites/deploy`

Upload built static files for a host (a LumenJS `--serverless` build, or any
static output). Serves straight from the document root — no Application row, no
process.

## Request

```
POST https://console.roxyon.com/sites/deploy
X-BEA-Session-Token: <session token>
Content-Type: multipart/form-data
```

| field | type | notes |
|---|---|---|
| `host` | text | `Domains.Name` on the caller's subscription |
| `folder` | text | sub-path under `public_html` (`""` = docroot) |
| `clean` | text | `"1"` to delete files not in the upload; default keep |
| `archive` | file | gzip tarball of the built site |

## Response

```jsonc
{ "ok": true, "host": "example.com", "path": "/", "files": 42 }
{ "ok": false, "error": "..." }
```

## Server behaviour

1. **Auth** — `wsIdentify()` → user.
2. **Ownership** — look up `Domains` by `Name`; assert its `Subscription`
   belongs to the caller (403 otherwise).
3. **Target** — `dest = /home/www/<host>/public_html[/<folder>]`.
   `folder` is normalised and must not escape `public_html` (`..`, absolute →
   reject).
4. **Validate** the archive exactly as `applications/deploy` does (size, gzip
   magic, entry count, path traversal, no symlink escape).
5. **Apply** inside the container as the account user:
   - `mkdir -p "$dest"`
   - extract the tarball over `$dest`
   - if `clean=1`, remove files under `$dest` that were not in the tarball
     (compute the delete set from the tar listing; never delete `$dest` itself).
6. No `nginx` reload needed — the host already serves `public_html`. Respond with
   the file count.

## Notes

- A LumenJS `--serverless` build also emits `dist/config.js` (API base URLs and
  the **public** JavaScript key). That is expected in the docroot — it is the
  same file `lm build --serverless --deploy` uploads over SFTP today.
- `clean=1` on the docroot itself (`folder=""`) is dangerous — a host may serve
  other files. The CLI only passes `clean` when the user opts in per deploy.
