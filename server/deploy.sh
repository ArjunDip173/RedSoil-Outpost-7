#!/usr/bin/env bash
# Puts LUNA's AI server on Cloudflare Workers (free plan, no credit card) and rebuilds
# RedSoil-Outpost7.html so the game uses it. Run it again any time to update the server or key.
#
# The first time you need:
#   - a free Google AI Studio key: https://aistudio.google.com/apikey
#   - a free Cloudflare account: the script opens the Cloudflare sign-in page for you
#
# Usage: bash server/deploy.sh
set -euo pipefail
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
command -v node >/dev/null || { echo "Please install Node.js 20 or newer first: https://nodejs.org"; exit 1; }

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# 1. The Gemini key, saved privately in server/.env (never committed, never in the game)
[ -f .env ] || bash set-key.sh
set -a
. ./.env
set +a

# 2. Check the key with Google. It goes in a header read from a private file, never in a URL.
printf 'x-goog-api-key: %s\n' "$GEMINI_API_KEY" > "$tmp/header"
chmod 600 "$tmp/header"
code="$(curl -s -m 20 -o "$tmp/models.json" -w '%{http_code}' -H @"$tmp/header" 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000' || true)"
if [ "$code" != 200 ]; then
  echo "Google did not accept this key (HTTP $code)."
  echo "Make a free key at https://aistudio.google.com/apikey, then run: bash server/set-key.sh"
  exit 1
fi
models="$(sed -n 's/^MODELS = "\(.*\)"/\1/p' wrangler.toml)"
node -e '
  const fs = require("fs");
  const have = new Set((JSON.parse(fs.readFileSync(process.argv[1], "utf8")).models || []).map((m) => m.name.replace(/^models\//, "")));
  const want = process.argv[2].split(",").map((s) => s.trim()).filter(Boolean);
  const ok = want.filter((m) => have.has(m));
  if (ok.length) console.log("Key OK. Gemini models LUNA will use: " + ok.join(", "));
  else console.log("Key OK, but none of " + want.join(", ") + " is listed for it. Flash models it has: " + [...have].filter((m) => m.includes("flash")).join(", ") + "\n(Edit MODELS in server/wrangler.toml if the test below fails.)");
' "$tmp/models.json" "$models"

# 3. Cloudflare's tool (wrangler) and sign-in
npm install --no-audit --no-fund --loglevel=error
if ! npx wrangler whoami --json >/dev/null 2>&1; then
  echo "Opening the Cloudflare sign-in page (make a free account if you don't have one)…"
  npx wrangler login
fi

# 4. Deploy the server, then store the key as a Cloudflare secret (that redeploys it with the key)
export WRANGLER_OUTPUT_FILE_PATH="$tmp/wrangler-output.json"
npx wrangler deploy
url="$(grep -oE 'https://[A-Za-z0-9.-]+\.workers\.dev' "$WRANGLER_OUTPUT_FILE_PATH" 2>/dev/null | head -1 || true)"
if [ -z "$url" ]; then
  read -rp "Paste the https://….workers.dev address printed above, then press Enter: " url
fi
url="${url%/}"
printf '%s' "$GEMINI_API_KEY" | npx wrangler secret put GEMINI_API_KEY

# 5. Ask LUNA a test question through the new server
echo "Testing $url …"
for _ in 1 2 3 4 5 6 7 8 9 10; do
  curl -s -m 10 "$url/health" | grep -q '"key":true' && break
  sleep 3
done
reply="$(curl -s -m 40 -H 'Content-Type: application/json' \
  -d '{"model":"luna","max_tokens":200,"messages":[{"role":"user","content":"Why is Mars red? Answer in one short sentence."}]}' \
  "$url/chat/completions" || true)"
tested=ok
node -e '
  let r = {};
  try { r = JSON.parse(process.argv[1]); } catch {}
  const t = r.choices && r.choices[0] && r.choices[0].message && r.choices[0].message.content;
  if (t) console.log("LUNA says: " + t);
  else { console.log("The test question failed: " + ((r.error && r.error.message) || process.argv[1] || "no answer")); process.exit(1); }
' "$reply" || tested=failed

# 6. Point the game at this server and rebuild RedSoil-Outpost7.html
node -e '
  const fs = require("fs");
  const p = process.argv[1];
  const s = fs.readFileSync(p, "utf8");
  fs.writeFileSync(p, s.replace(/export const AI_SERVER_URL = .*;/, "export const AI_SERVER_URL = '\''" + process.argv[2] + "'\'';"));
' ../src/config.ts "$url"
cd ..
npm install --no-audit --no-fund --loglevel=error
npm run build

echo
echo "LUNA's AI server: $url"
if [ "$tested" = ok ]; then
  echo "Done! Open RedSoil-Outpost7.html: Ask LUNA now gives AI answers. Commit and push to share it."
else
  echo "The game now points at the server, but the test question failed (see above)."
fi
