#!/usr/bin/env bash
# tunnel.sh — start a Cloudflare quick tunnel and auto-patch PUBLIC_API_URL
# Usage: bash tunnel.sh [--restart] [--port=PORT]
# macOS only (uses BSD sed -i '')

set -uo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
ROOT="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$ROOT/apps/api/.env"
TUNNEL_LOG="$(mktemp /tmp/cloudflared-XXXXXX.log)"
API_PORT=4000
RESTART=false
TUNNEL_PID=""
DEV_PID=""

# ── Parse flags ───────────────────────────────────────────────────────────────
for arg in "$@"; do
  case "$arg" in
    --restart)   RESTART=true ;;
    --port=*)    API_PORT="${arg#--port=}" ;;
    -h|--help)
      echo "Usage: bash tunnel.sh [--restart] [--port=PORT]"
      echo "  --restart   open a new Terminal window and run npm run dev:all"
      echo "  --port=N    tunnel to localhost:N (default 4000)"
      exit 0 ;;
  esac
done

# ── Cleanup ───────────────────────────────────────────────────────────────────
cleanup() {
  echo ""
  echo "Shutting down..."
  [ -n "$TUNNEL_PID" ] && kill "$TUNNEL_PID" 2>/dev/null || true
  [ -n "$DEV_PID" ]    && kill "$DEV_PID"    2>/dev/null || true
  rm -f "$TUNNEL_LOG"
}
trap cleanup EXIT INT TERM

# ── 1. Start cloudflared in background ───────────────────────────────────────
echo "Starting Cloudflare tunnel → http://localhost:$API_PORT"
npx cloudflared tunnel --url "http://localhost:$API_PORT" >"$TUNNEL_LOG" 2>&1 &
TUNNEL_PID=$!

# ── 2. Poll log for URL (up to 30s) ──────────────────────────────────────────
printf "Waiting for tunnel URL"
NEW_URL=""
for i in $(seq 1 30); do
  printf "."
  NEW_URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$TUNNEL_LOG" 2>/dev/null | head -1 || true)
  [ -n "$NEW_URL" ] && break
  # Exit early if cloudflared died
  if ! kill -0 "$TUNNEL_PID" 2>/dev/null; then
    echo ""
    echo "ERROR: cloudflared exited unexpectedly." >&2
    echo "--- log ---" >&2
    cat "$TUNNEL_LOG" >&2
    exit 1
  fi
  sleep 1
done
echo ""

if [ -z "$NEW_URL" ]; then
  echo "ERROR: tunnel URL not found after 30s." >&2
  echo "--- log ---" >&2
  cat "$TUNNEL_LOG" >&2
  exit 1
fi

# ── 3. Read OLD_URL from .env ─────────────────────────────────────────────────
OLD_URL=""
if [ -f "$ENV_FILE" ]; then
  # Strip leading spaces from key, trailing whitespace from value
  OLD_URL=$(grep -E '^[[:space:]]*PUBLIC_API_URL=' "$ENV_FILE" 2>/dev/null \
    | tail -1 \
    | sed 's/^[[:space:]]*PUBLIC_API_URL=[[:space:]]*//' \
    | sed 's/[[:space:]]*$//' \
    || true)
fi

# ── Show OLD → NEW diff ───────────────────────────────────────────────────────
echo ""
echo "┌─ PUBLIC_API_URL update ────────────────────────────────"
printf "│  OLD  %s\n" "${OLD_URL:-(not set)}"
printf "│  NEW  %s\n" "$NEW_URL"
echo "└────────────────────────────────────────────────────────"

# ── 4. Update .env ────────────────────────────────────────────────────────────
if grep -qE '^[[:space:]]*PUBLIC_API_URL=' "$ENV_FILE" 2>/dev/null; then
  # Replace existing line (handles leading spaces and trailing whitespace)
  sed -i '' "s|^[[:space:]]*PUBLIC_API_URL=.*|PUBLIC_API_URL=$NEW_URL|" "$ENV_FILE"
else
  # Append (ensure file ends with newline first)
  [ -n "$(tail -c1 "$ENV_FILE")" ] && echo "" >> "$ENV_FILE"
  echo "PUBLIC_API_URL=$NEW_URL" >> "$ENV_FILE"
fi

# ── 5. Replace OLD_URL across project ────────────────────────────────────────
if [ -n "$OLD_URL" ] && [ "$OLD_URL" != "$NEW_URL" ]; then
  echo ""
  echo "Scanning project for references to old URL..."

  CHANGED=0
  while IFS= read -r file; do
    # Skip binary files silently
    if grep -qIF "$OLD_URL" "$file" 2>/dev/null; then
      printf "  ↳ %s\n" "${file#"$ROOT"/}"
      sed -i '' "s|$OLD_URL|$NEW_URL|g" "$file"
      CHANGED=$((CHANGED + 1))
    fi
  done < <(
    find "$ROOT" \
      \( -name "node_modules" -o -name ".git" -o -name "dist" -o -name "build" \) -prune \
      -o -type f \
         -not -name "*.log" \
         -not -name "tunnel.sh" \
         -not -name "*.png" \
         -not -name "*.jpg" \
         -not -name "*.jpeg" \
         -not -name "*.gif" \
         -not -name "*.webp" \
         -not -name "*.mp4" \
         -not -name "*.mov" \
         -not -name "*.pdf" \
         -print \
      2>/dev/null
  )

  if [ "$CHANGED" -eq 0 ]; then
    echo "  (no other files reference the old URL)"
  else
    echo "  $CHANGED file(s) updated."
  fi
fi

# ── 6. Print result ───────────────────────────────────────────────────────────
echo ""
echo "✅ $NEW_URL"

# ── 9. Optional --restart ─────────────────────────────────────────────────────
if [ "$RESTART" = true ]; then
  echo ""
  echo "Opening dev server in new Terminal window..."
  if ! osascript -e "tell application \"Terminal\" to do script \"cd '$ROOT' && npm run dev:all\"" 2>/dev/null; then
    # Fallback: run in background in same terminal
    echo "(osascript unavailable — running dev server in background)"
    npm run dev:all --prefix "$ROOT" &
    DEV_PID=$!
  fi
fi

# ── 7. Keep cloudflared running in foreground ─────────────────────────────────
echo ""
echo "Cloudflared running (PID $TUNNEL_PID) — Ctrl+C to stop."
echo ""
wait "$TUNNEL_PID"
