#!/usr/bin/env bash
# Deploy the better-dh2e system to the remote Foundry over SSH/rsync.
# Reads host from creds.txt line 1 (e.g. "ssh root@HOST") and password from line 2.
# creds.txt is gitignored — never commit it.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CREDS="$ROOT/creds.txt"
HOST="$(sed -n '1p' "$CREDS" | awk '{print $2}')"      # e.g. root@76.13.45.240
PW_FILE="$(mktemp)"; chmod 600 "$PW_FILE"
sed -n '2p' "$CREDS" | tr -d '\n' > "$PW_FILE"
trap 'rm -f "$PW_FILE"' EXIT

DEST="/opt/foundrydata/Data/systems/better-dh2e"
SSH="sshpass -f $PW_FILE ssh -o StrictHostKeyChecking=accept-new"

# Ensure destination exists.
$SSH "$HOST" "mkdir -p $DEST"

# Sync only the files a Foundry system needs (no node_modules/docs/reference/test/git).
sshpass -f "$PW_FILE" rsync -az --delete -e "ssh -o StrictHostKeyChecking=accept-new" \
  "$ROOT/system.json" "$ROOT/template.json" \
  "$ROOT/scripts" "$ROOT/templates" "$ROOT/styles" "$ROOT/lang" "$ROOT/fonts" \
  "$HOST:$DEST/"

echo "Deployed to $HOST:$DEST"
