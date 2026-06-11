#!/usr/bin/env bash
set -euo pipefail

# deploy-website.sh — one-command deploy for the public klyna.dev website.
# Usage: ./scripts/deploy-website.sh  (run from repo root)

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$REPO_ROOT/apps/website"

echo "==> Installing dependencies (pnpm install)..."
pnpm install

echo "==> Building website..."
pnpm build

echo "==> Deploying to Vercel (project: klyna)..."
vercel deploy --prod --yes --project klyna

echo ""
echo "============================================================"
echo "Website deploy complete."
echo "NEXT: Paste env vars from SECRETS.md into the klyna project on Vercel."
echo "============================================================"
