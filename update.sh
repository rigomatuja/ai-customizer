#!/usr/bin/env bash
#
# AI Customizer — updater
#
# Pulls the latest template files from the official upstream repo
# WITHOUT touching anything you've created locally.
#
# Files that get overwritten (upstream wins):
#   ui/         manager/         docs/
#   README.md   LICENSE          .gitignore
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
  echo "    Updating will overwrite upstream-managed paths (ui/, manager/, docs/, README.md, LICENSE, .gitignore)."
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

updated_paths=()
missing_paths=()

for path in "${UPDATE_PATHS[@]}"; do
  if git cat-file -e "$UPSTREAM_REF:$path" 2>/dev/null; then
    git checkout "$UPSTREAM_REF" -- "$path"
    echo "    [✓] $path"
    updated_paths+=("$path")
  else
    echo "    [·] $path — not in upstream, skipping"
    missing_paths+=("$path")
  fi
done

# ---------------------------------------------------------------------------
# Post-update hints
# ---------------------------------------------------------------------------

echo ""
echo "==> Update complete."
echo ""

# Hint: reinstall UI deps if package files changed.
if git diff --cached --name-only 2>/dev/null | grep -qE '^ui/(package\.json|package-lock\.json)$'; then
  echo "  → ui/package.json or package-lock.json changed."
  echo "    Run:  cd ui && npm install"
  echo ""
fi

# Hint: reinstall manager if its sources changed.
if git diff --cached --name-only 2>/dev/null | grep -q '^manager/'; then
  echo "  → manager/ sources changed."
  echo "    Open the UI → Settings → Manager → Reinstall to pick up the new version."
  echo ""
fi

echo "  Review changes:   git status && git diff --cached"
echo "  Commit when ready: git commit -m \"chore: sync upstream template\""
echo ""
