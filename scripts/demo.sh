#!/usr/bin/env bash
#
# Start the whole demo with one command.
#
# The tourist app and the vendor scanner are separate applications (PRD §6), so a demo needs both
# running. Two terminals is a fiddly thing to explain to someone who just wants to see the product,
# so this runs both and shuts both down together on Ctrl+C — a stray dev server left holding port
# 5173 is the usual reason the next run mysteriously fails.
#
# The tourist app is the Vite web app in `apps/tourist-web`. It replaced the Expo app, which is
# retired in `.archive/mobile` — see `.archive/README.md`.
set -euo pipefail

cd "$(dirname "$0")/.."

TOURIST_PORT=5173
VENDOR_PORT=3001
PNPM="npx --yes pnpm@9"

# A previous run that was killed rather than stopped can leave the ports held.
for port in "$TOURIST_PORT" "$VENDOR_PORT"; do
  if lsof -ti:"$port" >/dev/null 2>&1; then
    echo "==> Port $port is in use; stopping the old process"
    lsof -ti:"$port" | xargs kill -9 2>/dev/null || true
  fi
done

pids=()
cleanup() {
  echo ""
  echo "==> Stopping the demo"
  for pid in "${pids[@]:-}"; do
    kill "$pid" 2>/dev/null || true
  done
  # Expo and Next both spawn children that outlive the parent signal.
  pkill -P $$ 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "==> Starting the vendor scanner on http://localhost:$VENDOR_PORT"
$PNPM --filter @cvip/vendor-web dev >/tmp/cvip-vendor.log 2>&1 &
pids+=($!)

echo "==> Starting the tourist app on http://localhost:$TOURIST_PORT"
$PNPM --filter @cvip/tourist-web dev >/tmp/cvip-tourist.log 2>&1 &
pids+=($!)

# Wait for the tourist app rather than printing a URL that is not answering yet.
for _ in $(seq 1 90); do
  if curl -sf -o /dev/null "http://localhost:$TOURIST_PORT/" 2>/dev/null; then
    break
  fi
  sleep 2
done

cat <<BANNER

  ────────────────────────────────────────────────────────────
   Caribbean VIP demo is running

     Tourist app     http://localhost:$TOURIST_PORT
     Vendor scanner  http://localhost:$VENDOR_PORT

   Use your browser's phone view for the tourist app.
   Walkthrough: docs/HANDOVER.md §2

   Logs: /tmp/cvip-tourist.log  ·  /tmp/cvip-vendor.log
   Press Ctrl+C to stop both.
  ────────────────────────────────────────────────────────────

BANNER

wait
