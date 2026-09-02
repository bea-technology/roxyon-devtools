#!/usr/bin/env bash
# app-source-apply.sh — extract an uploaded source tarball into a path inside a
# Cloud Hosting container, as the account user.
#
# Runs INSIDE the container:
#   incus exec <container> -- su <user> -c 'bash -s' < app-source-apply.sh -- <SRC> <TARBALL>
#
# STDIN is read first (nothing is read here, but keep the discipline — any
# `incus exec` before the first read drains it). Args:
#   $1  SRC      absolute destination path (the app's SourcePath, or a docroot)
#   $2  TARBALL  path to the .tar.gz, already visible inside the container
#
# Emits `RX_SOURCE_APPLIED=<file count>` on success; non-zero exit on failure.
set -euo pipefail

# Read and discard stdin up front so a caller can safely pipe `bash -s`.
if [ ! -t 0 ]; then cat >/dev/null || true; fi

SRC="${1:?SRC required}"
TARBALL="${2:?TARBALL required}"

case "$SRC" in
  /home/www/*/public_html*) : ;;
  *) echo "refusing to write outside /home/www/*/public_html: $SRC" >&2; exit 2 ;;
esac

[ -f "$TARBALL" ] || { echo "tarball not found: $TARBALL" >&2; exit 2; }

# gzip magic
magic=$(head -c2 "$TARBALL" | od -An -tx1 | tr -d ' \n')
[ "$magic" = "1f8b" ] || { echo "not a gzip archive" >&2; exit 2; }

# Pre-scan: no absolute paths, no traversal.
if tar -tzf "$TARBALL" | grep -Eq '(^/|(^|/)\.\.(/|$))'; then
  echo "archive contains unsafe paths" >&2; exit 2
fi

mkdir -p "$SRC"

# Extract over the destination. --no-same-owner: files land as the account user.
# node_modules/.git/.venv are never in the tarball, so they are untouched.
tar -xzf "$TARBALL" -C "$SRC" --no-same-owner --no-overwrite-dir

count=$(tar -tzf "$TARBALL" | grep -vc '/$' || true)
echo "RX_SOURCE_APPLIED=$count"
