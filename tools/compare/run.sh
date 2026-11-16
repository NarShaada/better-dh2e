#!/usr/bin/env bash
# tools/compare/run.sh — did a change alter behaviour it was not meant to?
#
# Builds two copies of the system — the code at a git ref and the code in the working tree — runs
# identical scenarios through both, and reports every observable difference: dice formulas, chat
# cards, actor and weapon state, startup wiring, and what every sheet action writes. Whatever it
# reports must be something the change set out to do; anything else is a regression.
#
#   npm run compare                      working tree vs HEAD
#   npm run compare -- v0.4.10           working tree vs a tag, branch or commit
#   npm run compare -- HEAD --keep       keep the two copies and the full JSON results (path printed)
#   npm run compare -- HEAD --verbose    also record every scenario's full diff in the JSON (with --keep)
#
# Real item data sharpens the comparison. Point it at a folder of item source JSON (weapons.json and
# its siblings) either with BDH_COMPENDIUM_SRC or by writing the folder's path — absolute, or
# relative to the repository root — on the first line of tools/compare/.corpus, which is not
# tracked. Without one those sections fall back to built-in fixtures and the report says so.
#
# Limits, so a clean report is not over-read: this runs under the test stubs (test/helpers), not
# inside Foundry. It says nothing about canvas interaction, real permission enforcement, several
# clients at once, or rendered HTML — and it only compares the scenarios it contains. Dev tooling:
# not part of the packaged system.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
REF="HEAD"; KEEP=0; VERBOSE=""
for arg in "$@"; do
  case "$arg" in
    --keep) KEEP=1 ;;
    --verbose) VERBOSE="--verbose" ;;
    -*) echo "unknown option: $arg" >&2; exit 2 ;;
    *) REF="$arg" ;;
  esac
done
git -C "$ROOT" rev-parse --verify --quiet "$REF^{commit}" >/dev/null || { echo "not a commit: $REF" >&2; exit 2; }

WORK="$(mktemp -d "${TMPDIR:-/tmp}/bdh-compare.XXXXXX")"
cleanup() { if [ "$KEEP" = 1 ]; then echo "Kept: $WORK"; else rm -rf "$WORK"; fi; }
trap cleanup EXIT

mkdir -p "$WORK/old" "$WORK/new"
git -C "$ROOT" archive "$REF" scripts templates lang | tar -x -C "$WORK/old"
# The working tree as it is on disk, untracked files included. `test` supplies the Foundry stubs.
cp -R "$ROOT/scripts" "$ROOT/templates" "$ROOT/lang" "$ROOT/test" "$WORK/new/"

CORPUS="${BDH_COMPENDIUM_SRC:-}"
if [ -z "$CORPUS" ] && [ -f "$ROOT/tools/compare/.corpus" ]; then
  IFS= read -r CORPUS < "$ROOT/tools/compare/.corpus" || true
  case "$CORPUS" in /*|"") ;; *) CORPUS="$ROOT/$CORPUS" ;; esac
fi
CORPUS_ARG=""
if [ -n "$CORPUS" ] && [ -f "$CORPUS/weapons.json" ]; then CORPUS_ARG="--corpus=$CORPUS"; fi

echo "Comparing the working tree against $REF ($(git -C "$ROOT" rev-parse --short "$REF"))"
node "$ROOT/tools/compare/scenarios.mjs" "$WORK" ${CORPUS_ARG:+"$CORPUS_ARG"} ${VERBOSE:+"$VERBOSE"}
echo
node "$ROOT/tools/compare/wiring.mjs" "$WORK"
