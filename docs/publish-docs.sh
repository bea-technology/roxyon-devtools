#!/usr/bin/env bash
# Stage the knowledge-layer docs into the two site repos, then deploy each.
#
# Run from the repo root. Points at the local BEACDN checkouts; adjust ROXYON_SITE
# / LUMENJS_SITE if yours live elsewhere. This only COPIES — you review the diff
# and run the site's own deploy (`lm build --serverless --deploy`).
set -euo pipefail

ROXYON_SITE="${ROXYON_SITE:-/opt/homebrew/var/www/BEACDN/roxyon.com}"
LUMENJS_SITE="${LUMENJS_SITE:-/opt/homebrew/var/www/BEACDN/lumenjs.com}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "→ roxyon.com"
cp "$HERE/docs/llms/roxyon.llms.txt"          "$ROXYON_SITE/src/llms.txt"
cp "$HERE/docs/openapi/baas.yaml"              "$ROXYON_SITE/src/openapi.yaml"
mkdir -p "$ROXYON_SITE/src/llms"
cp "$HERE/packages/mcp-server/resources/baas.md"   "$ROXYON_SITE/src/llms/baas.md"
cp "$HERE/packages/mcp-server/resources/deploy.md" "$ROXYON_SITE/src/llms/deploy.md"

echo "→ lumenjs.com"
cp "$HERE/docs/llms/lumenjs.llms.txt"          "$LUMENJS_SITE/src/llms.txt"
mkdir -p "$LUMENJS_SITE/src/llms"
cp "$HERE/packages/mcp-server/resources/lumenjs.md" "$LUMENJS_SITE/src/llms/lumenjs.md"

cat <<'EOF'

Staged. Now, in each site repo:
  git diff                       # review
  lm build --serverless --deploy # ship

Then confirm:
  curl -s https://roxyon.com/llms.txt | head
  curl -s https://roxyon.com/openapi.yaml | head
  curl -s https://lumenjs.com/llms.txt | head
  curl -s https://lumenjs.com/llms/lumenjs.md | head
EOF
