# Roxyon deploy benchmark

How long does it take to go from nothing to a live HTTPS site on Roxyon? `bench.sh` measures it end to end, from
the outside, with no step skipped or cached. Each run:

1. creates a brand-new `<name>.roxyon.com` host (`POST /domains/create`) and waits until it is active (DNS + vhost),
2. deploys a one-page static site with `roxyon deploy` (or your own project with `TEMPLATE=<folder>`), with a unique
   marker in the page,
3. waits until `https://<host>/` answers 200 with a valid certificate **and** that marker.

```bash
ROXYON_TOKEN=roxp_... SUBSCRIPTION=<hosting subscription id> HOSTS_FILE=hosts.txt ./bench.sh 3
```

`ROXYON_TOKEN` is a personal access token with the `deploy` scope (`roxyon token create bench --scopes deploy,read`).
The hosts stay on your account afterwards; delete them in the console (their names are in `HOSTS_FILE`).

## Results

All runs from a Mac in Lebanon over a home connection, `@roxyon/cli` 0.2.1, static site, 3 runs each.

| date (CEST) | what changed | median total | runs (s) |
|---|---|---|---|
| 2026-10-18 00:30 | baseline | **45.3 s** | 45.3 / 46.2 / 44.6 |
| 2026-10-18 01:08 | `*.roxyon.com` wildcard certificate: a new host no longer waits ~25 s for its own | **29.3 s** | 21.2 / 29.3 / 29.6 |
| 2026-10-18 01:35 | the platform picks up new hosts every 4 s and tasks every 3 s (was 20 s / 15 s) | **13.8 s** | 14.2 / 13.8 / 10.8 |
| 2026-10-18 03:10 | same, with this self-contained script | **13.5 s** | 13.5 / 14.9 / 11.5 |

Per step today: creating the host ~7-10 s, the deploy ~2.5-4.5 s, HTTPS live under 2 s after the deploy.

These are Roxyon's own numbers. No other platform was measured here, so they make no comparison; run the same three
steps against any provider you want to compare.
