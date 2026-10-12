# rx.js: browser client for Roxyon BaaS

| Version | Talks to | Published at | Source |
|---|---|---|---|
| 1.0.0 | V1 (`/1`, app id + JavaScript key) | `https://cdn.roxyon.com/libs/rxjs/1.0.0/rx.js` | `v1/rx.js`, kept exactly as published |
| 2.0.0 | V2 (`/2`, publishable key, per-class rules) | `https://cdn.roxyon.com/libs/rxjs/2.0.0/rx.js` | `src/rx.js` |

1.0.0 is never changed: sites on V1 keep working. An app moves to V2 by switching its script tag and config:

```html
<script src="https://cdn.roxyon.com/libs/rxjs/2.0.0/rx.js"></script>
<script>
  const rx = new RX({ publishableKey: 'rxpk_…' }); // from the project's API keys in the console (Roxyon Base)
</script>
```

Same calls as 1.0.0: `rx.get/post/put/delete(path, data)` resolve with `{ results: [...] }` (or `{ error, code, status }`,
never a rejection), `rx.post('/batch', { requests })` with an array, `rx.get('/_endpoint/...')` with the endpoint's body.
`limit: -1` reads every page (up to 5000 rows). What V2 changes:

- **Nothing is open by default.** Each class needs V2 rules (public / user / owner / member / server); set them before
  switching a site, and read every query the site makes against them.
- **Sign-in is by email code:** `rx.login({ email })` → `{ challengeId }`, then `rx.login({ challengeId, code })`.
  There is no password sign-in on V2.
- **Tokens** are scoped, bound to the browser (a device id in localStorage), and kept in localStorage (not cookies).
  `config.onSignedOut` is called when the server ends a user's session.
- `rx.me()` reads the user's own `Users` row (the app's Users rule must let owners read it).

Publishing: copy `src/rx.js` to `cdn.roxyon.com/public_html/libs/rxjs/2.0.0/rx.js` (gwf container on app-1). A new
version gets a new folder; never overwrite a published one.
