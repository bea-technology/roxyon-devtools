# Roxyon BaaS — reference for AI models

The Roxyon Backend-as-a-Service (the "RX" engine) is a Parse-Server-style data +
auth backend. A LumenJS or any other front end talks to it over REST.

## Endpoint & headers

- Base URL: `https://www.beaapis.com/1`
- Every request: `X-BEA-Application-ID: <app id>`
- Public browser/CLI clients also send `X-BEA-JavaScript-Key: <public key>` to
  mint an anonymous token (`POST /Auth {"scope":"public"}` → `{access_token,
  refresh_token, expires_in}`), then send `X-BEA-Access-Token` (anonymous) or
  `X-BEA-Session-Token` (a logged-in user) on subsequent calls.
- `X-BEA-Authorization` carries the **REST key** — server-side only, never ship it
  to a browser.

## Auth flow

| Step | Call |
|---|---|
| Anonymous token | `POST /Auth` `{scope:"public"}` + App-ID + JS-Key |
| Log in | `POST /Auth/login` `{Email, Password}` → `{session_token, refresh_token}` (no `session_token` in the reply = wrong credentials) |
| OTP sign-in | `POST /Auth/login/otp {Email}` → `{challengeId}`, then `POST /Auth/login/otp-verify {challengeId, code}` |
| Current user | `POST /Auth/me` → user object with `objectId` |
| Log out | `POST /Auth/logout` |

`/_account/login-precheck` is a console cloud function gated behind the REST key —
not callable from a public client. Go straight to `/Auth/login`.

## Data API

- `GET /<ClassName>?where=...&fields=...&limit=...&include=...&order=...`
- `POST /<ClassName>` — create (JSON body)
- `PUT /<ClassName>` — update (JSON body **must include `objectId`**)
- `DELETE /<ClassName>` — `{objectId}`
- `POST /batch` — `{requests:[{path,method,body}, ...]}`

### Query rules that bite

- **Writes resolve on failure, they do not reject.** A failed write returns
  `200` with `{error: "..."}` at the top level or inside `results[]`. Always
  check for `error` before treating a write as successful.
- The `in` operator takes a **comma-joined string, not an array**:
  `where[Ids][in]=a,b,c`. An array serialises to bracket-index keys the API
  ignores.
- A `select` sub-query nested inside an `or` group crashes the API — resolve ids
  first, then `or:[..., {objectId:{in:"a,b"}}]`.
- `GET /Schemas` (needs the REST key) is the authoritative list of classes,
  fields and pointer targets. Schema writes go to `PUT /Schemas/<Class>` with a
  **double-wrapped** `fields` payload.
- `objectId` is unique **per class, not globally**.

## Pointers

`{ "pointer": { "className": "Users", "field": "Owner", "objectId": "<target class id from /Schemas>" } }`

## Relevant classes for deploys

`Applications`, `ApplicationProcesses`, `ApplicationRoutes`, `Domains`,
`Subscriptions`, `Privileges` (User → Subscription grants). See the `deploy`
resource for how they fit together.
