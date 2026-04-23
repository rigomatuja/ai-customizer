#!/usr/bin/env bash
#
# AI Customizer — updater
#
# Pulls the latest template files from the official upstream repo
# WITHOUT touching anything you've created locally, then ensures UI deps
# are installed and offers to launch the UI.
#
# Idempotent. Safe to rerun — with no upstream changes and no dep drift,
# it prints "no changes" and exits (or offers to launch the UI if one
# isn't already running).
#
# Files that get overwritten (upstream wins):
#   ui/                 manager/                docs/
#   .claude/skills/     .opencode/skills/       .ai-customizer/models/
#   install.sh          update.sh
#   README.md           LICENSE                 .gitignore
#
# Files that are NEVER touched (your state stays put):
#   customizations/**
#   application-guide.json
#   .ai-customizer/triggers.json
#   .ai-customizer/catalog.json
#
# Changes are left in your working tree — review with `git diff`, then
# commit when you're happy.
#
# Run from the catalog root:
#   ./update.sh
#

set -euo pipefail

UPSTREAM_URL="https://github.com/rigomatuja/ai-customizer.git"
UPSTREAM_REMOTE="upstream"
UPSTREAM_BRANCH="main"

UPDATE_PATHS=(
  "ui"
  "manager"
  "docs"
  ".claude/skills"
  ".opencode/skills"
  ".ai-customizer/models"
  "install.sh"
  "update.sh"
  "README.md"
  "LICENSE"
  ".gitignore"
)

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo "==> AI Customizer — update"
echo ""

# ---------------------------------------------------------------------------
# Sanity checks
# ---------------------------------------------------------------------------

if ! command -v git >/dev/null 2>&1; then
  echo "[✗] git not found — install from https://git-scm.com" >&2
  exit 1
fi

if [ ! -d ".git" ]; then
  echo "[✗] Not a git repo — updater needs git to fetch upstream." >&2
  echo "    Run this from the directory you cloned the template into." >&2
  exit 1
fi

if [ ! -f ".ai-customizer/catalog.json" ]; then
  echo "[✗] Not a catalog root — .ai-customizer/catalog.json missing." >&2
  exit 1
fi

echo "[✓] Catalog root: $(pwd)"

# ---------------------------------------------------------------------------
# Upstream remote — add if missing, verify URL if present
# ---------------------------------------------------------------------------

if git remote get-url "$UPSTREAM_REMOTE" >/dev/null 2>&1; then
  current_url="$(git remote get-url "$UPSTREAM_REMOTE")"
  if [ "$current_url" != "$UPSTREAM_URL" ]; then
    echo "[✗] Remote '$UPSTREAM_REMOTE' already exists but points elsewhere:" >&2
    echo "      current:  $current_url" >&2
    echo "      expected: $UPSTREAM_URL" >&2
    echo "    Fix with: git remote set-url $UPSTREAM_REMOTE $UPSTREAM_URL" >&2
    exit 1
  fi
  echo "[✓] Upstream remote: $current_url"
else
  echo "[+] Adding upstream remote: $UPSTREAM_URL"
  git remote add "$UPSTREAM_REMOTE" "$UPSTREAM_URL"
fi

# ---------------------------------------------------------------------------
# Warn on dirty working tree
# ---------------------------------------------------------------------------

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo ""
  echo "[!] Working tree has uncommitted changes."
  echo "    Updating will overwrite upstream-managed paths."
  echo "    Any changes to THOSE paths will be lost."
  echo ""
  read -r -p "Continue anyway? [y/N] " reply
  case "$reply" in
    y|Y|yes|YES) ;;
    *) echo "Aborted."; exit 1 ;;
  esac
fi

# ---------------------------------------------------------------------------
# Fetch upstream
# ---------------------------------------------------------------------------

echo ""
echo "==> Fetching $UPSTREAM_REMOTE/$UPSTREAM_BRANCH..."
git fetch "$UPSTREAM_REMOTE" "$UPSTREAM_BRANCH"

UPSTREAM_REF="$UPSTREAM_REMOTE/$UPSTREAM_BRANCH"

# ---------------------------------------------------------------------------
# Checkout each upstream-managed path
# ---------------------------------------------------------------------------

echo ""
echo "==> Pulling upstream files..."

for path in "${UPDATE_PATHS[@]}"; do
  if git cat-file -e "$UPSTREAM_REF:$path" 2>/dev/null; then
    git checkout "$UPSTREAM_REF" -- "$path"
    echo "    [✓] $path"
  else
    echo "    [·] $path — not in upstream, skipping"
  fi
done

# ---------------------------------------------------------------------------
# Determine whether anything actually changed (idempotency visibility)
# ---------------------------------------------------------------------------

CHANGED_FILES=$(git diff --cached --name-only 2>/dev/null || true)
if [ -z "$CHANGED_FILES" ]; then
  echo ""
  echo "[i] Already up to date — upstream matched your local copy. No-op."
  UPDATE_HAD_CHANGES=0
else
  UPDATE_HAD_CHANGES=1
fi

# ---------------------------------------------------------------------------
# Ensure UI deps (idempotent — npm install no-ops when lockfile matches)
# ---------------------------------------------------------------------------

UI_DEPS_SYNCED=0
if [ -d "ui" ] && [ -f "ui/package.json" ]; then
  echo ""
  if [ "$UPDATE_HAD_CHANGES" = "1" ] && echo "$CHANGED_FILES" | grep -qE '^ui/(package\.json|package-lock\.json)$'; then
    echo "==> ui/package.json changed — running npm install..."
  else
    echo "==> Ensuring UI dependencies (fast no-op when already synced)..."
  fi
  ( cd ui && npm install )
  UI_DEPS_SYNCED=1
fi

# ---------------------------------------------------------------------------
# Post-update hints
# ---------------------------------------------------------------------------

if [ "$UPDATE_HAD_CHANGES" = "1" ]; then
  echo ""
  echo "==> Update complete. Files changed:"
  echo "$CHANGED_FILES" | sed 's/^/      /'
  echo ""

  if echo "$CHANGED_FILES" | grep -q '^manager/'; then
    echo "  → manager/ sources changed."
    echo "    Open the UI → Settings → Manager → Reinstall to pick up the new version."
    echo ""
  fi

  # Self-update awareness: if the updater scripts themselves were
  # refreshed, the current bash process is still running from the OLD
  # inode (bash keeps the original file open). The new script takes
  # effect from the NEXT invocation. Tell the user.
  if echo "$CHANGED_FILES" | grep -qE '^(update\.sh|install\.sh)$'; then
    echo "  [!] install.sh / update.sh were updated in this run."
    echo "      The current process is still running the OLD script."
    echo "      Next time you run ./update.sh or ./install.sh you'll get"
    echo "      the new behavior. No further action needed now."
    echo ""
  fi

  echo "  Review changes:   git status && git diff --cached"
  echo "  Commit when ready: git commit -m \"chore: sync upstream template\""
  echo ""
fi

# ---------------------------------------------------------------------------
# Offer to launch the UI (skipped when an instance is already running)
# ---------------------------------------------------------------------------

port_is_open() {
  local port="$1"
  (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null && { exec 3<&- 3>&-; return 0; }
  return 1
}

if port_is_open 3236 || port_is_open 5256; then
  echo "[i] UI already running — skipping launch prompt."
  port_is_open 3236 && echo "    Hono server:  http://127.0.0.1:3236"
  port_is_open 5256 && echo "    UI (browser): http://127.0.0.1:5256"
  exit 0
fi

if [ "$UI_DEPS_SYNCED" != "1" ]; then
  exit 0
fi

echo ""
read -r -p "Launch the UI now? [Y/n] " launch_reply
case "$launch_reply" in
  n|N|no|NO)
    echo ""
    echo "  OK. Start it later with:  ./install.sh  (or:  cd ui && npm run dev)"
    exit 0
    ;;
  *)
    echo ""
    echo "==> Starting the UI — Ctrl+C to stop"
    echo "    Hono server:  http://127.0.0.1:3236"
    echo "    UI (browser): http://127.0.0.1:5256   ← open this"
    echo ""
    cd ui
    exec npm run dev
    ;;
esac
