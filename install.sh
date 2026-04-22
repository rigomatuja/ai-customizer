#!/usr/bin/env bash
#
# AI Customizer — installer
#
# Does steps 2 and 3 from the README:
#   2. cd ui && npm install
#   3. npm run dev
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
# Install UI dependencies
# ---------------------------------------------------------------------------

echo ""
echo "==> Installing UI dependencies (may take a minute)..."
( cd ui && npm install )

# ---------------------------------------------------------------------------
# Launch dev server (foreground, Ctrl+C to stop)
# ---------------------------------------------------------------------------

echo ""
echo "==> Starting the UI — Ctrl+C to stop"
echo "    Hono server:  http://127.0.0.1:3000"
echo "    UI (browser): http://127.0.0.1:5173   ← open this"
echo ""

cd ui
exec npm run dev
