is #!/usr/bin/env bash
# start.sh — ONE command: tunnel + API + Web
# Uses tunnel.sh logic then starts all services in the same terminal.

set -uo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$ROOT/apps/api/.env"
TUNNEL_LOG="$(mktemp /tmp/cloudflared-XXXXXX)"
API_PORT=4000
TUNNEL_PID=""
SERVICES_PID=""

cleanup() {
  echo ""
  echo "Shutting down..."
  [ -n "$TUNNEL_PID" ]   && kill "$TUNNEL_PID"   2>/dev/null || true
  [ -n "$SERVICES_PID" ] && kill "$SERVICES_PID" 2>/dev/null || true
  rm -f "$TUNNEL_LOG"
}
trap cleanup EXIT INT TERM

# ── 1. Start tunnel ───────────────────────────────────────────────────────────
echo "Starting Cloudflare tunnel → http://localhost:$API_PORT"
npx cloudflared tunnel --url "http://localhost:$API_PORT" >"$TUNNEL_LOG" 2>&1 &
TUNNEL_PID=$!

# ── 2. Poll for URL ───────────────────────────────────────────────────────────
printf "Waiting for tunnel URL"
NEW_URL=""
for i in $(seq 1 30); do
  printf "."
  NEW_URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$TUNNEL_LOG" 2>/dev/null | head -1 || true)
  [ -n "$NEW_URL" ] && break
  if ! kill -0 "$TUNNEL_PID" 2>/dev/null; then
    echo ""
    echo "ERROR: cloudflared exited unexpectedly." >&2
    cat "$TUNNEL_LOG" >&2
    exit 1
  fi
  sleep 1
done
echo ""

if [ -z "$NEW_URL" ]; then
  echo "ERROR: tunnel URL not found after 30s." >&2
  cat "$TUNNEL_LOG" >&2
  exit 1
fi

# ── 3. Read old URL ───────────────────────────────────────────────────────────
OLD_URL=""
if [ -f "$ENV_FILE" ]; then
  OLD_URL=$(grep -E '^[[:space:]]*PUBLIC_API_URL=' "$ENV_FILE" 2>/dev/null \
    | tail -1 \
    | sed 's/^[[:space:]]*PUBLIC_API_URL=[[:space:]]*//' \
    | sed 's/[[:space:]]*$//' \
    || true)
fi

echo ""
echo "┌─ PUBLIC_API_URL ───────────────────────────────────────"
printf "│  OLD  %s\n" "${OLD_URL:-(not set)}"
printf "│  NEW  %s\n" "$NEW_URL"
echo "└────────────────────────────────────────────────────────"

# ── 4. Patch .env ─────────────────────────────────────────────────────────────
if grep -qE '^[[:space:]]*PUBLIC_API_URL=' "$ENV_FILE" 2>/dev/null; then
  sed -i '' "s|^[[:space:]]*PUBLIC_API_URL=.*|PUBLIC_API_URL=$NEW_URL|" "$ENV_FILE"
else
  [ -n "$(tail -c1 "$ENV_FILE")" ] && echo "" >> "$ENV_FILE"
  echo "PUBLIC_API_URL=$NEW_URL" >> "$ENV_FILE"
fi

# ── 5. Replace old URL across project ────────────────────────────────────────
if [ -n "$OLD_URL" ] && [ "$OLD_URL" != "$NEW_URL" ]; then
  CHANGED=0
  while IFS= read -r file; do
    if grep -qIF "$OLD_URL" "$file" 2>/dev/null; then
      printf "  ↳ updated %s\n" "${file#"$ROOT"/}"
      sed -i '' "s|$OLD_URL|$NEW_URL|g" "$file"
      CHANGED=$((CHANGED + 1))
    fi
  done < <(
    find "$ROOT" \
      \( -name "node_modules" -o -name ".git" -o -name "dist" -o -name "build" \) -prune \
      -o -type f \
         -not -name "*.log" -not -name "start.sh" -not -name "tunnel.sh" \
         -not -name "*.png" -not -name "*.jpg" -not -name "*.jpeg" \
         -not -name "*.mp4" -not -name "*.mov" -not -name "*.pdf" \
         -print 2>/dev/null
  )
  [ "$CHANGED" -gt 0 ] && echo "  $CHANGED file(s) updated."
fi

echo ""
echo "✅ $NEW_URL"
echo ""
echo "Starting API + Web services..."
echo "────────────────────────────────────────────────────────"

# ── Start all services ────────────────────────────────────────────────────────
npm run dev:all --prefix "$ROOT" &
SERVICES_PID=$!

wait "$SERVICES_PID"
