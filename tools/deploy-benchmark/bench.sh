#!/bin/bash
# Roxyon deploy benchmark: from "nothing" to a live HTTPS URL, measured end to end.
#
#   ROXYON_TOKEN=roxp_... SUBSCRIPTION=<id> ./bench.sh [runs] [host-prefix]
#
# Each run, on a fresh <prefix><run>-<random>.roxyon.com:
#   1. POST console /domains/create, then wait until the host is active (DNS + vhost)
#   2. roxyon deploy of the static template with a unique marker in index.html
#   3. wait until https://<host>/ answers 200 with a valid certificate AND the marker
# and prints the seconds for each step and the total. The hosts are left in place: delete them from the
# console afterwards (HOSTS_FILE=<path> collects their names).
# Needs: bash, curl, python3, openssl, npx (@roxyon/cli). Times are wall-clock from this machine.
set -euo pipefail

RUNS="${1:-3}"; PREFIX="${2:-bench}"
: "${ROXYON_TOKEN:?set ROXYON_TOKEN (a PAT with the deploy scope)}"
: "${SUBSCRIPTION:?set SUBSCRIPTION (the hosting subscription to create the host on)}"
CONSOLE="${CONSOLE:-https://console.roxyon.com}"
HERE="$(cd "$(dirname "$0")" && pwd)"
TEMPLATE="${TEMPLATE:-}"   # a project folder with roxyon.json; empty = a one-page static site made here
now() { python3 -c 'import time;print(time.time())'; }
secs() { python3 -c "print(f'{$2-$1:.1f}')"; }
json() { python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('$1',''))"; }

printf '%-34s %8s %8s %8s %8s\n' host host_s deploy_s live_s total_s
for run in $(seq 1 "$RUNS"); do
    host="${PREFIX}${run}-$(openssl rand -hex 3).roxyon.com"
    marker="rx-bench-$(openssl rand -hex 8)"
    work="$(mktemp -d)"
    if [ -n "$TEMPLATE" ]; then
        cp -R "$TEMPLATE/." "$work/"
    else
        mkdir -p "$work/public"
        printf '<!doctype html><html><head><meta charset="utf-8"><title>bench</title></head><body><h1>bench</h1></body></html>\n' > "$work/public/index.html"
        printf '{"name":"bench","host":"","folder":"","runtime":"lumen","kind":"static","build":"","outDir":"public"}\n' > "$work/roxyon.json"
    fi
    python3 - "$work/roxyon.json" "$host" <<'EOF'
import sys,json; p,h=sys.argv[1:]; d=json.load(open(p)); d["host"]=h; json.dump(d,open(p,"w"),indent=2)
EOF
    sed -i.bak "s#</body>#<p id=\"bench\">$marker</p></body>#" "$work/public/index.html" && rm -f "$work/public/index.html.bak"

    t0=$(now)
    status=""
    for i in $(seq 1 120); do
        status=$(curl -s -m 60 -X POST "$CONSOLE/domains/create" -H "Authorization: Bearer $ROXYON_TOKEN" \
            -H 'Content-Type: application/json' -d "{\"host\":\"$host\",\"subscription\":\"$SUBSCRIPTION\"}" | json status)
        [ "$status" = active ] && break
        [ "$status" = failed ] && { echo "$host: host creation failed" >&2; exit 1; }
        sleep 2
    done
    [ "$status" = active ] || { echo "$host: host not active after 4 min" >&2; exit 1; }
    t1=$(now)

    (cd "$work" && npx -y @roxyon/cli deploy >/dev/null)
    t2=$(now)

    ok=0
    for i in $(seq 1 300); do
        if curl -sf -m 10 "https://$host/" 2>/dev/null | grep -q "$marker"; then ok=1; break; fi
        sleep 1
    done
    [ "$ok" = 1 ] || { echo "$host: not live with a valid certificate after 5 min" >&2; exit 1; }
    t3=$(now)

    printf '%-34s %8s %8s %8s %8s\n' "$host" "$(secs "$t0" "$t1")" "$(secs "$t1" "$t2")" "$(secs "$t2" "$t3")" "$(secs "$t0" "$t3")"
    echo "$host" >> "${HOSTS_FILE:-/dev/null}"
    rm -rf "$work"
done
