#!/bin/bash
# app-source-apply.sh <container> <user> <dest-path>
#
# Overlays a gzip tarball (read from stdin) onto <dest-path> INSIDE a customer
# container, as the account user. Used by the console's
#   POST /applications/deploy   -> dest = the application's SourcePath
#   POST /sites/deploy           -> dest = /home/www/<host>/public_html[/<folder>]
#
# The console has already authenticated the caller and confirmed they own the
# target. This script's job is to place the files safely:
#   - reads stdin FIRST (incus exec drains stdin, so nothing may `incus …` before
#     the tarball is captured; later incus calls all get </dev/null)
#   - refuses a dest outside /home/www and any path traversal
#   - refuses an archive with an absolute member, a `..` member, or a symlink
#     member (a link could redirect a later write outside dest)
#   - extracts with --no-same-owner --no-overwrite-dir; does NOT delete files the
#     archive omits (same "overlay, don't clean" contract as app-git-sync.sh) and
#     leaves node_modules / .git / .venv alone (the client never ships them)
#
# Prints:
#   RX_FILES=<n>        regular files written
#   RX_APPLIED=<dest>
set -uo pipefail

CONTAINER="${1:-}"
USERNAME="${2:-}"
DEST="${3:-}"

if [ -z "$CONTAINER" ] || [ -z "$USERNAME" ] || [ -z "$DEST" ]; then
    echo "Usage: app-source-apply.sh <container> <user> <dest-path>" >&2
    exit 2
fi

case "$DEST" in
    /home/www/*) : ;;
    *) echo "Refusing destination outside /home/www: $DEST" >&2; exit 2 ;;
esac
case "$DEST" in *..*) echo "Refusing path traversal: $DEST" >&2; exit 2 ;; esac

if ! printf '%s' "$CONTAINER" | grep -Eq '^[A-Za-z0-9._-]{1,64}$'; then
    echo "Refusing container name: $CONTAINER" >&2; exit 2
fi

# --- read the archive FIRST -------------------------------------------------
TARBALL="$(mktemp /tmp/rxsrc.XXXXXX)"
cleanup() {
    rm -f "$TARBALL"
    [ -n "${CONT_TB:-}" ] && incus exec "$CONTAINER" -- rm -f "$CONT_TB" </dev/null 2>/dev/null || true
}
trap cleanup EXIT

cat > "$TARBALL"
if [ ! -s "$TARBALL" ]; then
    echo "No archive on stdin" >&2; exit 2
fi

# gzip magic (od is coreutils — always present; xxd is not)
if [ "$(head -c2 "$TARBALL" | od -An -tx1 | tr -d ' \n')" != "1f8b" ]; then
    echo "stdin is not a gzip archive" >&2; exit 2
fi

# --- vet every member ------------------------------------------------------
# tar -tvz shows the type flag in column 1 ('-' file, 'd' dir, 'l'/'h' link).
if ! LISTING="$(tar -tvzf "$TARBALL" 2>/dev/null)"; then
    echo "archive is not readable" >&2; exit 2
fi

BAD="$(printf '%s\n' "$LISTING" | awk '
    { name=$NF }
    $1 ~ /^[lh]/ { print "link:" name; next }
    name ~ /^\// { print "abs:" name; next }
    name ~ /(^|\/)\.\.(\/|$)/ { print "dotdot:" name; next }
')"
if [ -n "$BAD" ]; then
    echo "Refusing unsafe archive members:" >&2
    printf '%s\n' "$BAD" | head -5 >&2
    exit 2
fi

FILE_COUNT="$(printf '%s\n' "$LISTING" | awk '$1 ~ /^-/ {c++} END{print c+0}')"

# --- container + destination parent --------------------------------------
if ! incus info "$CONTAINER" >/dev/null 2>&1 </dev/null; then
    echo "Container not found: $CONTAINER" >&2; exit 1
fi

DEST_PARENT="$(dirname "$DEST")"
if ! incus exec "$CONTAINER" -- test -d "$DEST_PARENT" </dev/null; then
    echo "Destination parent does not exist in container: $DEST_PARENT" >&2
    exit 1
fi

CONT_UID="$(incus exec "$CONTAINER" -- id -u "$USERNAME" </dev/null 2>/dev/null)"
CONT_UID="${CONT_UID:-1000}"

CONT_TB="/tmp/.rxsrc.$$.tgz"
incus file push "$TARBALL" "$CONTAINER$CONT_TB" --mode 0600 --uid "$CONT_UID" --gid "$CONT_UID" --quiet

# --- extract, inside the container, as the account user ------------------
EXTRACT_BODY='
set -eu
DEST='"'$DEST'"'
TB='"'$CONT_TB'"'
mkdir -p "$DEST"
tar -xzf "$TB" -C "$DEST" \
    --no-same-owner --no-same-permissions --no-overwrite-dir \
    --exclude=".git" --exclude="node_modules" --exclude=".venv"
rm -f "$TB"
'

if ! incus exec "$CONTAINER" -- su "$USERNAME" -s /bin/bash -c "$EXTRACT_BODY" </dev/null; then
    echo "extract failed into $DEST" >&2
    exit 1
fi
CONT_TB=""   # removed inside the container already

printf 'RX_FILES=%s\n' "$FILE_COUNT"
printf 'RX_APPLIED=%s\n' "$DEST"
echo "OK: applied $FILE_COUNT file(s) to $DEST"
