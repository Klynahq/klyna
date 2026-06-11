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
#
# NOTE: Shopify does NOT allow "Shopify" in app names. Each app is named
#       "Klyna <Feature>" (e.g. "Klyna Bundles"). If the CLI prompts for
#       "App name:", just press Enter — the script pipes the correct name.

set -e

DEV_STORE="${DEV_STORE:-klynadev.myshopify.com}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKTREES_PARENT="$(dirname "$ROOT")"

# slug → Partners app display name (no "Shopify" — Shopify rejects that word)
declare -A APP_NAMES
APP_NAMES["shopify-bundles"]="Klyna Bundles"
APP_NAMES["shopify-upsell"]="Klyna Upsell"
APP_NAMES["shopify-rewards"]="Klyna Rewards"
APP_NAMES["shopify-reviews"]="Klyna Reviews"
APP_NAMES["shopify-urgency"]="Klyna Urgency"
APP_NAMES["shopify-restock"]="Klyna Back-in-Stock"
APP_NAMES["shopify-wishlist"]="Klyna Wishlist"
APP_NAMES["shopify-feed"]="Klyna Feed"
APP_NAMES["shopify-sticky-cart"]="Klyna Sticky Cart"
APP_NAMES["shopify-capture"]="Klyna Capture"

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
  app_name="${APP_NAMES[$slug]}"

  if [ ! -d "$app_dir" ]; then
    echo "⚠ Worktree not found: $app_dir — skipping"
    continue
  fi

  echo "─── Setting up: $slug ───"
  echo "    App name in Partners: \"$app_name\""

  # Install deps
  echo "  Installing dependencies..."
  (cd "$app_dir" && pnpm install --silent)

  # Generate Prisma client
  echo "  Generating Prisma client..."
  (cd "$app_dir" && npx prisma generate 2>/dev/null)

  # Link to Partner dashboard.
  # The CLI prompts "App name:" when creating a new app.
  # Pipe the correct name so the prompt is answered automatically.
  # If the CLI asks "Create new / Link existing", it will get the name on a
  # subsequent line — this works for non-TTY stdin on Shopify CLI v3.
  echo "  Linking to Shopify Partner dashboard..."
  echo "  (If the browser opens again for consent, approve it)"
  (cd "$app_dir" && printf '%s\n' "$app_name" | shopify app config link --config shopify.app.toml) || {
    echo ""
    echo "  ⚠  Auto-link failed for $slug. Run manually:"
    echo "     cd $app_dir"
    echo "     shopify app config link --config shopify.app.toml"
    echo "     When prompted for 'App name:', enter: $app_name"
    echo ""
  }

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
