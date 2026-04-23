#!/usr/bin/env bash
#
# AI Customizer — installer
#
# Idempotent. Safe to rerun any number of times:
#   - If the UI is already running → no-op, prints where to reach it.
#   - If UI deps are already installed → npm install is a fast no-op.
#   - Otherwise → installs deps and launches the dev server in foreground.
#
# Assumes you've already cloned this repo. Run from the catalog root:
#   ./install.sh
#
# Requires: Node 20+, npm, git. Checks prereqs before touching anything.
#

set -euo pipefail

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo "==> AI Customizer — install"
echo ""

# ---------------------------------------------------------------------------
# Prereq checks
# ---------------------------------------------------------------------------

check_cmd() {
  local cmd="$1"
  local hint="$2"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "[✗] $cmd not found — install: $hint" >&2
    exit 1
  fi
  echo "[✓] $cmd: $(command -v "$cmd")"
}

check_cmd node "Node 20+ from https://nodejs.org (LTS recommended)"
check_cmd npm  "ships with Node"
check_cmd git  "https://git-scm.com"

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "[✗] Node $NODE_MAJOR detected — need 20 or newer." >&2
  exit 1
fi
echo "[✓] Node version: $(node --version)"

# Catalog root sanity check
if [ ! -f ".ai-customizer/catalog.json" ]; then
  echo "" >&2
  echo "[✗] Not a catalog root — .ai-customizer/catalog.json missing." >&2
  echo "    Run this script from the directory you cloned the template into." >&2
  exit 1
fi
echo "[✓] Catalog detected: $(pwd)"

if [ ! -d "ui" ]; then
  echo "[✗] ui/ directory missing. Is this a proper clone?" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Idempotency: is the UI already running?
#
# Probe both the Hono server port (3236) and the Vite client port (5256)
# via bash's built-in /dev/tcp. If either is bound, assume a prior install
# is running and bail out with a friendly no-op.
# ---------------------------------------------------------------------------

port_is_open() {
  local port="$1"
  (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null && { exec 3<&- 3>&-; return 0; }
  return 1
}

if port_is_open 3236 || port_is_open 5256; then
  echo ""
  echo "[i] The AI Customizer UI appears to be already running:"
  port_is_open 3236 && echo "    Hono server:  http://127.0.0.1:3236"
  port_is_open 5256 && echo "    UI (browser): http://127.0.0.1:5256"
  echo ""
  echo "    Nothing to do. To restart: stop the running instance"
  echo "    (Ctrl+C in the terminal holding it) and rerun ./install.sh."
  exit 0
fi

# ---------------------------------------------------------------------------
# Install UI dependencies (npm install is itself idempotent — fast no-op
# when everything matches package-lock.json)
# ---------------------------------------------------------------------------

echo ""
echo "==> Ensuring UI dependencies..."
( cd ui && npm install )

# ---------------------------------------------------------------------------
# Launch dev server (foreground, Ctrl+C to stop)
# ---------------------------------------------------------------------------

echo ""
echo "==> Starting the UI — Ctrl+C to stop"
echo "    Hono server:  http://127.0.0.1:3236"
echo "    UI (browser): http://127.0.0.1:5256   ← open this"
echo ""

cd ui
exec npm run dev
