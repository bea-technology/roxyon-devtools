# Recipe — build a site and host it on Roxyon

The end-to-end flow for *"build me a landing page and put it on
`promo.mycompany.com`"* over the hosted connector. No local files, no CLI.

## The tools

| Tool | When |
|---|---|
| `roxyon_list_domains` | see the account's hosts + which are still `provisioning` |
| `roxyon_add_domain` | create a **subdomain** of a domain the account already hosts (or `*.roxyon.com`) — DNS + web server + automatic HTTPS |
| `roxyon_deploy_content` | publish the files you generated (HTML/CSS/JS/assets as `{path, content}` entries) |
| `roxyon_list_files` / `roxyon_read_file` | inspect what's live so you can iterate |

## Flow

1. **Pick / create the host.**
   - Deploying to a domain already in the account's Sites → skip to step 2.
   - New subdomain → `roxyon_add_domain { host: "promo.mycompany.com", confirm: true }`
     (add `spa: true` if the site uses client-side routing). It returns fast, while
     DNS/vhost/TLS are still coming up — that's fine, keep going.
2. **Generate the site.** Plain, self-contained static output:
   - `index.html` at the root. One real `.html` per page, **or** `about/index.html`,
     `pricing/index.html` — the default routing serves `/about/` from
     `about/index.html`.
   - **Relative** asset paths (`./styles.css`, `assets/logo.png`) — never absolute.
   - Inline small CSS/JS or ship a couple of files; keep it under **60 files /
     2 MB total / 1 MB per file**. Base64-encode images (`encoding: "base64"`).
   - No build step. If you want reactivity, LumenJS `.view` files work with **no
     build** — load `https://cdn.roxyon.com/libs/rxjs/1.0.0/rx.js` in `index.html`
     and follow `roxyon://docs/lumenjs`. Only a genuine single-page app that owns
     every route needs `spa: true` (deep links → `index.html`).
3. **Deploy.**
   `roxyon_deploy_content { host, files: [{path, content}, …], clean: true, confirm: true }`
   - `clean: true` for a fresh site — it replaces the document root (and removes
     the placeholder "Coming Soon" page). For an edit to an existing site, run
     `roxyon_list_files` first, then deploy **without** `clean` and include only
     the changed files (overlay).
4. **Verify.** `roxyon_list_files { host }` to confirm the files landed. Then tell
   the user the URL.
   - **HTTPS lag:** a brand-new host serves over http within a minute; the TLS
     certificate follows 1–3 minutes later. If `https://` fails at first, that's
     expected — it resolves itself.

## Notes

- The connector cannot build a project from a local folder or a git repo — that's
  the `roxyon` CLI (`npm i -g @roxyon/cli`) or `roxyon_link_github`. It *can* take
  files you generate here.
- `roxyon_add_domain` only makes **subdomains** of domains the account already
  hosts (or `roxyon.com`). Adding a brand-new top-level domain is a console task.
