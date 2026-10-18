#!/usr/bin/env bash
# External uptime check for Roxyon. Prints one line per DOWN service ("name<TAB>detail") on stdout,
# progress on stderr. Exit 0 = all up, 1 = something is down, other = the script broke. No dependencies beyond bash + curl (+ nc).
#
# A service counts as down only if it fails ATTEMPTS checks in a row, RETRY_DELAY seconds apart.
set -uo pipefail

TIMEOUT="${TIMEOUT:-20}"
ATTEMPTS="${ATTEMPTS:-2}"
RETRY_DELAY="${RETRY_DELAY:-30}"

# name | kind | target | expected
#   http: expected = the HTTP status that means "up"
#   tcp:  target = host:port, up = the TCP connection opens
CHECKS=(
  "roxyon.com|http|https://roxyon.com/|200"
  "console|http|https://console.roxyon.com/|200"
  "leads|http|https://leads.roxyon.com/|200"
  "mcp|http|https://mcp.roxyon.com/health|200"
  "baas|http|https://www.beaapis.com/1/|401"
  "mail-imap|tcp|mail.roxyon.com:993|open"
)

# check_one <kind> <target> <expected> -> prints a failure detail and returns 1, or returns 0
check_one() {
  local kind=$1 target=$2 expected=$3
  case "$kind" in
    http)
      local code
      code=$(curl -sS -o /dev/null -m "$TIMEOUT" -w '%{http_code}' "$target" 2>/dev/null)
      if [[ "$code" == "$expected" ]]; then return 0; fi
      if [[ -z "$code" || "$code" == "000" ]]; then echo "no answer within ${TIMEOUT}s"; else echo "HTTP $code (want $expected)"; fi
      return 1
      ;;
    tcp)
      local host=${target%:*} port=${target##*:}
      if command -v nc >/dev/null; then
        nc -z -w "$TIMEOUT" "$host" "$port" >/dev/null 2>&1 && return 0
      else
        timeout "$TIMEOUT" bash -c "</dev/tcp/$host/$port" >/dev/null 2>&1 && return 0
      fi
      echo "TCP $port did not open within ${TIMEOUT}s"
      return 1
      ;;
  esac
}

pending=("${CHECKS[@]}")
details=() # "name<TAB>detail" for the last failure of each still-pending check

for ((attempt = 1; attempt <= ATTEMPTS; attempt++)); do
  failed=()
  details=()
  for c in "${pending[@]}"; do
    IFS='|' read -r name kind target expected <<<"$c"
    if [[ "$kind" == tcp ]] && ! getent hosts "${target%:*}" >/dev/null 2>&1 && ! host "${target%:*}" >/dev/null 2>&1; then
      echo "skip  $name (${target%:*} does not resolve here)" >&2
      continue
    fi
    if out=$(check_one "$kind" "$target" "$expected"); then
      echo "up    $name" >&2
    else
      echo "FAIL  $name: $out (attempt $attempt/$ATTEMPTS)" >&2
      failed+=("$c")
      details+=("$name"$'\t'"$out")
    fi
  done
  pending=("${failed[@]+"${failed[@]}"}")
  ((${#pending[@]} == 0)) && break
  ((attempt < ATTEMPTS)) && sleep "$RETRY_DELAY"
done

for d in "${details[@]+"${details[@]}"}"; do
  printf '%s\n' "$d"
done
((${#pending[@]} == 0))
