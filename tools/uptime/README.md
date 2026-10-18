# Roxyon uptime check

An external check that alerts when Roxyon is down. It runs on GitHub Actions, outside our servers, so it still
works when lb-1 or the private network is down. (On 2026-10-18, 10:55-11:18 CEST, the provider cut the private
network and restarted lb-1. Nothing alerted anyone for those 22 minutes.)

## What it checks

Every 5 minutes (`.github/workflows/uptime.yml`), `check.sh` checks:

| name | check | up when |
|---|---|---|
| `roxyon.com` | `https://roxyon.com/` | HTTP 200 |
| `console` | `https://console.roxyon.com/` | HTTP 200 |
| `leads` | `https://leads.roxyon.com/` | HTTP 200 |
| `mcp` | `https://mcp.roxyon.com/health` | HTTP 200 |
| `baas` | `https://www.beaapis.com/1/` | HTTP 401 (no token sent, so 401 means the API answered) |
| `mail-imap` | TCP connect to `mail.roxyon.com:993` | the connection opens (skipped if the name does not resolve) |

Each check has a 20 s timeout. A service counts as down only if it fails twice in a row, about 30 s apart, so a
single slow answer does not open an issue. To add a service, add a line to `CHECKS` in `check.sh`.

## How the alert reaches people

The alert is a **GitHub issue** in this repo, labelled `outage`. The open `outage` issue is the only state.
No secrets are needed: the workflow uses its own `GITHUB_TOKEN` with `issues: write`.

- Something goes down: the workflow opens **`DOWN: <services> since <UTC time>`** (it creates the label if it
  does not exist yet).
- The set of down services changes: it adds a comment and updates the title. It stays quiet while the set stays
  the same.
- Everything is back: it comments **`Recovered at <time>, down for N min`** and closes the issue.

GitHub sends an email (and a mobile push, if you use the GitHub app) for new issues **only to people who watch
the repo**. To get the alerts:

1. Open https://github.com/bea-technology/roxyon-devtools, click **Watch → Custom**, tick **Issues**, then **Apply**
   (or pick **All Activity**).
2. Check that https://github.com/settings/notifications sends **Watching** notifications by **Email**, to an
   address you read.

Optional: set the repository variable `UPTIME_MENTION` (Settings → Secrets and variables → Actions → Variables),
for example `@your-github-user`. It is added to every new outage issue and change comment, so those people are
notified even if they do not watch the repo.

## Limits

- GitHub runs scheduled workflows late when it is busy, often by 5-15 minutes and sometimes more. Expect to hear
  about an outage within about 5-20 minutes, not seconds.
- This repo is public, so outage issues are public too.
- GitHub turns off scheduled workflows in a public repo after 60 days with no commits. If that happens, it emails
  the owner; turn it back on under Actions → Uptime → Enable workflow.
- Schedules only run from the default branch (`main`).

## Run it by hand

```bash
tools/uptime/check.sh          # prints the down services (name<TAB>detail), exit 1 if any
```

Or Actions → Uptime → **Run workflow** (`gh workflow run uptime.yml -R bea-technology/roxyon-devtools`).
