#!/usr/bin/env bash
set -euo pipefail

# deploy-admin.sh — one-command deploy for the Klyna admin panel.
# Usage: ./scripts/deploy-admin.sh  (run from repo root)

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ ! -f "$REPO_ROOT/SECRETS.md" ]; then
  echo "ERROR: SECRETS.md not found at repo root ($REPO_ROOT/SECRETS.md)."
  echo "Generate or populate it before deploying — it contains the env vars you'll paste into Vercel."
  exit 1
fi

cd "$REPO_ROOT/apps/admin"

echo "==> Installing dependencies (pnpm install)..."
pnpm install

echo "==> Generating Prisma client..."
pnpm prisma generate

echo "==> Building admin app..."
pnpm build

echo "==> Deploying to Vercel (project: klyna-admin)..."
# --yes auto-creates/links the project on first run.
vercel deploy --prod --yes --project klyna-admin

echo ""
echo "============================================================"
echo "Admin deploy complete."
echo "NEXT: Set custom domain admin.klyna.dev in the Vercel project,"
echo "      add the CNAME in Cloudflare DNS-only mode (grey cloud)."
echo "============================================================"
