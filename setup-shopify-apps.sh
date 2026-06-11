#!/usr/bin/env bash
# ============================================================
# Klyna — Shopify App Setup Script
# ============================================================
# Run this ONCE to:
#   1. Log into Shopify Partners (browser OAuth)
#   2. Create + link each app in your Partner dashboard
#   3. Install dependencies
#
# Requirements:
#   - Shopify CLI 3+ (brew install shopify-cli OR npm i -g @shopify/cli)
#   - pnpm (corepack enable pnpm)
#   - A Shopify Partner account (https://partners.shopify.com)
#   - A dev store (https://klynadev.myshopify.com OR your own)
#
# Usage:
#   chmod +x setup-shopify-apps.sh
#   DEV_STORE=klynadev.myshopify.com ./setup-shopify-apps.sh

set -e

DEV_STORE="${DEV_STORE:-klynadev.myshopify.com}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKTREES_PARENT="$(dirname "$ROOT")"

APPS=(
  "shopify-bundles"
  "shopify-upsell"
  "shopify-rewards"
  "shopify-reviews"
  "shopify-urgency"
  "shopify-restock"
  "shopify-wishlist"
  "shopify-feed"
  "shopify-sticky-cart"
  "shopify-capture"
)

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║           Klyna Shopify Apps — Setup Script              ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
echo "This will set up all 10 Shopify apps for dev store: $DEV_STORE"
echo ""

# Step 1: Authenticate
echo "─── Step 1: Shopify Partner authentication ───"
echo "Opening your browser for Shopify login..."
shopify auth login
echo "✓ Authenticated"
echo ""

# Step 2: Install + link each app
for slug in "${APPS[@]}"; do
  app_dir="$WORKTREES_PARENT/klyna-${slug}/apps/${slug}"
  
  if [ ! -d "$app_dir" ]; then
    echo "⚠ Worktree not found: $app_dir — skipping"
    continue
  fi
  
  echo "─── Setting up: $slug ───"
  
  # Install deps
  echo "  Installing dependencies..."
  (cd "$app_dir" && pnpm install --silent)
  
  # Generate Prisma client
  echo "  Generating Prisma client..."
  (cd "$app_dir" && npx prisma generate 2>/dev/null)
  
  # Link to Partner dashboard (creates app if it doesn't exist)
  echo "  Linking to Shopify Partner dashboard..."
  echo "  (You may be asked to choose 'Create new app' — pick that)"
  (cd "$app_dir" && shopify app config link --config shopify.app.toml)
  
  # Copy .env.example to .env
  if [ -f "$app_dir/.env.example" ] && [ ! -f "$app_dir/.env" ]; then
    cp "$app_dir/.env.example" "$app_dir/.env"
    echo "  Created .env from .env.example"
    echo "  ⚠ Open $app_dir/.env and fill in SHOPIFY_API_KEY + SHOPIFY_API_SECRET"
  fi
  
  echo "  ✓ $slug ready"
  echo ""
done

echo "╔══════════════════════════════════════════════════════════╗"
echo "║                     Setup complete!                      ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
echo "To run any app against $DEV_STORE:"
echo "  cd $WORKTREES_PARENT/klyna-<slug>/apps/<slug>"
echo "  pnpm dev -- --store=$DEV_STORE"
echo ""
echo "Example — run Klyna Bundles:"
echo "  cd $WORKTREES_PARENT/klyna-shopify-bundles/apps/shopify-bundles"
echo "  pnpm dev -- --store=$DEV_STORE"
echo ""
