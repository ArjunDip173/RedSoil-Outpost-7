#!/usr/bin/env bash
# Saves the Google Gemini key for LUNA's AI server into server/.env without showing it on screen.
# Get a free key (no credit card) at https://aistudio.google.com/apikey
# server/.env is private: it is in .gitignore and never goes into the game or the zip.
set -euo pipefail
cd "$(dirname "$0")"
read -rsp "Paste your Google AI Studio key (it stays hidden), then press Enter: " key
echo
key="$(printf '%s' "$key" | tr -d '[:space:]')"
if [ -z "$key" ]; then
  echo "Nothing was entered, so nothing changed."
  exit 1
fi
umask 077
printf '# Private: the Google key LUNA'"'"'s AI server uses. Never share or commit this file.\nGEMINI_API_KEY=%s\n' "$key" > .env
echo "Saved to server/.env."
