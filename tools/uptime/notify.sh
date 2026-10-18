#!/usr/bin/env bash
# Turns the output of check.sh into GitHub issues. The open issue labelled `outage` IS the state:
#   something down, no open issue  -> open "DOWN: <services> since <UTC time>"
#   something down, open issue     -> comment + retitle only if the set of down services changed
#   all up, open issue             -> comment "Recovered at ..., down for N min" and close it
#   all up, no open issue          -> nothing
# Usage: notify.sh <file with check.sh stdout>. Needs gh with GH_TOKEN (issues: write) and GITHUB_REPOSITORY.
# Optional: UPTIME_MENTION="@someone @other" is added to new issues and changes, RUN_URL links the run.
set -euo pipefail

down_file=${1:?usage: notify.sh <down-file>}
label=outage
now_utc=$(date -u '+%Y-%m-%d %H:%M UTC')
now_epoch=$(date -u +%s)

# "a, b, c" (sorted) and a markdown list of details
down_set=$(cut -f1 "$down_file" | sed '/^$/d' | sort -u | paste -sd, - | sed 's/,/, /g')
details=$(awk -F'\t' 'NF { printf "- **%s**: %s\n", $1, $2 }' "$down_file")
footer="${RUN_URL:+[check run]($RUN_URL)}"
mention=${UPTIME_MENTION:-}

open_json=$(gh issue list -R "$GITHUB_REPOSITORY" --label "$label" --state open --limit 1 \
  --json number,body,createdAt --jq '.[0] // empty')

if [[ -n "$down_set" ]]; then
  marker="<!-- uptime-down: $down_set -->"
  body=$(printf '%s\n\n%s\n\nChecked from GitHub Actions (outside Roxyon), 2 failed attempts ~30 s apart. %s\n\n%s\n' \
    "$details" "$mention" "$footer" "$marker")
  if [[ -z "$open_json" ]]; then
    gh label create "$label" -R "$GITHUB_REPOSITORY" --color B60205 \
      --description 'Opened/closed by the uptime check' >/dev/null 2>&1 || true
    gh issue create -R "$GITHUB_REPOSITORY" --label "$label" \
      --title "DOWN: $down_set since $now_utc" --body "$body"
    exit 0
  fi
  number=$(jq -r .number <<<"$open_json")
  old_set=$(jq -r .body <<<"$open_json" | sed -n 's/^<!-- uptime-down: \(.*\) -->$/\1/p' | tail -1)
  if [[ "$old_set" == "$down_set" ]]; then
    echo "#$number already open for: $down_set"
    exit 0
  fi
  since=$(jq -r .createdAt <<<"$open_json" | sed 's/T/ /; s/:[0-9]*Z$/ UTC/')
  gh issue comment "$number" -R "$GITHUB_REPOSITORY" \
    --body "$(printf 'Down services changed at %s: now **%s** (was: %s)\n\n%s\n\n%s %s' \
      "$now_utc" "$down_set" "${old_set:-?}" "$details" "$mention" "$footer")"
  gh issue edit "$number" -R "$GITHUB_REPOSITORY" --title "DOWN: $down_set since $since" --body "$body"
  exit 0
fi

if [[ -n "$open_json" ]]; then
  number=$(jq -r .number <<<"$open_json")
  created=$(jq -r .createdAt <<<"$open_json")
  created_epoch=$(date -u -d "$created" +%s 2>/dev/null || date -u -j -f '%Y-%m-%dT%H:%M:%SZ' "$created" +%s)
  minutes=$(((now_epoch - created_epoch + 59) / 60))
  gh issue comment "$number" -R "$GITHUB_REPOSITORY" \
    --body "Recovered at $now_utc, down for $minutes min (measured from when this issue opened). $footer"
  gh issue close "$number" -R "$GITHUB_REPOSITORY"
else
  echo "all up, no open outage issue"
fi
