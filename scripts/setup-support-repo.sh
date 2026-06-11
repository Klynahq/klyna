#!/usr/bin/env bash
set -euo pipefail

# setup-support-repo.sh — create the private klynahq/klyna-support repo
# used by the /contact form to file tickets as GitHub issues.

if ! command -v gh >/dev/null 2>&1; then
  echo "ERROR: gh CLI not installed. Install it: brew install gh"
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "ERROR: gh CLI not authenticated. Run: gh auth login"
  exit 1
fi

REPO="klynahq/klyna-support"

if gh repo view "$REPO" >/dev/null 2>&1; then
  echo "Repo $REPO already exists — nothing to do."
else
  echo "Creating private repo $REPO..."
  gh repo create "$REPO" \
    --private \
    --description "Klyna support tickets (synced from /contact form)" \
    --confirm
  echo "Created $REPO."
fi

echo ""
echo "============================================================"
echo "NEXT: Generate a Personal Access Token with 'repo' scope and"
echo "paste it into Vercel as GITHUB_TOKEN on the klyna website project:"
echo ""
echo "  https://github.com/settings/tokens/new?scopes=repo&description=klyna-support-sync"
echo "============================================================"
