#!/usr/bin/env bash
# Optional: run LUNA's AI through a local LiteLLM proxy instead of the cloud server.
# Uses the same key as the server (server/.env). Then set the AI server in the game's
# Settings → Advanced to http://localhost:4000.
set -euo pipefail
cd "$(dirname "$0")"
export PATH="$HOME/.local/bin:/opt/homebrew/bin:$PATH"
if [ ! -f ../server/.env ]; then
  echo "Missing server/.env. Run: bash server/set-key.sh"
  exit 1
fi
set -a
. ../server/.env
set +a
if [[ "$GEMINI_API_KEY" == AIza* ]]; then
  export GEMINI_API_BASE="https://generativelanguage.googleapis.com/v1beta"
else
  export GEMINI_API_BASE="https://aiplatform.googleapis.com/v1/publishers/google"
fi
echo "LiteLLM for Ask LUNA on http://localhost:4000 (this computer only). Ctrl+C to stop."
exec litellm --config config.yaml --host 127.0.0.1 --port 4000
