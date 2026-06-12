#!/usr/bin/env bash
# Build better-dh2e.zip containing the runtime files at the zip root, for Foundry's
# manifest/download install (Foundry extracts the zip into Data/systems/better-dh2e/).
# Excludes dev-only files (node_modules, tests, docs, tooling, secrets).
set -euo pipefail
cd "$(dirname "$0")/.."
rm -f better-dh2e.zip
zip -r better-dh2e.zip \
  system.json template.json LICENSE README.md \
  scripts styles lang templates fonts \
  -x '*.DS_Store' >/dev/null
echo "Built better-dh2e.zip ($(du -h better-dh2e.zip | cut -f1))"
