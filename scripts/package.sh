#!/usr/bin/env bash
# Builds the game and makes a clean submission zip in release/.
# Leaves out secrets (server/.env, litellm/.env), node_modules, build folders and macOS junk files.
# Usage: npm run package
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="/opt/homebrew/bin:$PATH"
npm run build
mkdir -p release
out="release/RedSoil-Outpost7-submission.zip"
rm -f "$out"
zip -r -X -q "$out" . \
  -x 'node_modules/*' 'dist/*' 'release/*' '.git/*' '.claude/*' '*/.claude/*' \
     '*.DS_Store' '*/.DS_Store' '__MACOSX/*' '*.log' \
     'litellm/.env' 'litellm/.env.tmp' 'server/.env' '*.dev.vars' '*/.wrangler/*' '.wrangler/*'
# safety check: refuse to finish if anything private slipped in
if unzip -Z1 "$out" | grep -E '(^|/)\.env$|(^|/)\.env\.tmp$|(^|/)\.dev\.vars$|node_modules/|\.DS_Store|(^|/)\.claude/'; then
  echo "STOP: a private or junk file got into the zip (listed above). Not safe to share."
  rm -f "$out"
  exit 1
fi
if unzip -p "$out" | grep -aqE 'sk-ant-[A-Za-z0-9_-]{10,}|AIza[0-9A-Za-z_-]{30,}|sk-luna-[0-9a-f]{16,}'; then
  echo "STOP: something that looks like an API key is inside the zip. Not safe to share."
  rm -f "$out"
  exit 1
fi
echo "Clean zip ready: $out ($(du -h "$out" | cut -f1)). No API keys inside."
