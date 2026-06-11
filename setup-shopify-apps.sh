#!/usr/bin/env bash
# ============================================================
# Klyna — Shopify App Setup Script
# ============================================================
# Run this ONCE to:
#   1. Log into Shopify Partners (browser OAuth)
#   2. For each app: install deps, generate Prisma, run `shopify app config link`
#
# The CLI prompts for "App name:" interactively — just press Enter on each
# (the script preloads the correct name as default), and pick the dev store.
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
# Resume:
#   The script skips any app that already has a real client_id in its
#   shopify.app.toml — safe to re-run after errors.

set -e

DEV_STORE="${DEV_STORE:-klynadev.myshopify.com}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKTREES_PARENT="$(dirname "$ROOT")"

# slug → Partners app display name (no "Shopify" — Shopify rejects that word)
app_name_for() {
  case "$1" in
    shopify-bundles)     echo "Klyna Bundles" ;;
    shopify-upsell)      echo "Klyna Upsell" ;;
    shopify-rewards)     echo "Klyna Rewards" ;;
    shopify-reviews)     echo "Klyna Reviews" ;;
    shopify-urgency)     echo "Klyna Urgency" ;;
    shopify-restock)     echo "Klyna Back-in-Stock" ;;
    shopify-wishlist)    echo "Klyna Wishlist" ;;
    shopify-feed)        echo "Klyna Feed" ;;
    shopify-sticky-cart) echo "Klyna Sticky Cart" ;;
    shopify-capture)     echo "Klyna Capture" ;;
    *)                   echo "Klyna ${1#shopify-}" ;;
  esac
}

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
echo "Dev store: $DEV_STORE"
echo ""
echo "For each of 10 apps, the Shopify CLI will prompt you interactively."
echo "Quick guide:"
echo "  • 'Create a new app or connect existing?' → Create new"
echo "  • 'App name:'                             → Press Enter (preset)"
echo "  • 'Organization:'                         → Pick your klyna Dev org"
echo ""

# Step 1: Authenticate (no-op if already logged in)
echo "─── Step 1: Shopify Partner authentication ───"
shopify auth login
echo "✓ Authenticated"
echo ""

# Step 2: Pre-install deps + generate Prisma for ALL apps in parallel,
# so the interactive linking phase is fast.
echo "─── Step 2: Installing dependencies in all 10 worktrees ───"
echo "(This runs once up front so each link step is instant.)"
echo ""

PIDS=()
for slug in "${APPS[@]}"; do
  app_dir="$WORKTREES_PARENT/klyna-${slug}/apps/${slug}"
  if [ -d "$app_dir" ]; then
    (
      cd "$app_dir"
      pnpm install --silent >/dev/null 2>&1
      npx prisma generate >/dev/null 2>&1
      echo "  ✓ $slug"
    ) &
    PIDS+=($!)
  fi
done

# Wait for all installs to finish
for pid in "${PIDS[@]}"; do wait "$pid" 2>/dev/null || true; done
echo ""
echo "✓ All dependencies installed"
echo ""

# Step 3: Interactively link each app
echo "─── Step 3: Linking each app to Partners dashboard ───"
echo ""

for slug in "${APPS[@]}"; do
  app_dir="$WORKTREES_PARENT/klyna-${slug}/apps/${slug}"
  app_name="$(app_name_for "$slug")"

  if [ ! -d "$app_dir" ]; then
    echo "⚠ Worktree not found: $app_dir — skipping"
    continue
  fi

  # Skip if already linked (has a real client_id, not the placeholder)
  toml="$app_dir/shopify.app.toml"
  if [ -f "$toml" ]; then
    existing_id=$(grep -E '^client_id\s*=' "$toml" | head -1 | sed -E 's/.*"([^"]+)".*/\1/')
    if [ -n "$existing_id" ] && [[ "$existing_id" != REPLACE* ]]; then
      echo "✓ $slug — already linked (client_id: ${existing_id:0:16}…), skipping"
      continue
    fi
  fi

  echo ""
  echo "╭─────────────────────────────────────────────────────────╮"
  echo "│  $((${#APPS[@]} - ${#APPS[@]} + 1)). $slug"
  echo "│  → When prompted for 'App name:', enter:  $app_name"
  echo "╰─────────────────────────────────────────────────────────╯"
  echo ""

  # Run config link in the FOREGROUND — full TTY, prompts work normally
  cd "$app_dir"
  shopify app config link --config shopify.app.toml || {
    echo ""
    echo "  ⚠ Skipped $slug — re-run script to retry just this one."
    cd "$ROOT"
    continue
  }
  cd "$ROOT"

  # Copy .env.example → .env (CLI doesn't do this)
  if [ -f "$app_dir/.env.example" ] && [ ! -f "$app_dir/.env" ]; then
    cp "$app_dir/.env.example" "$app_dir/.env"
    echo ""
    echo "  ✓ Created .env from .env.example"
    echo "  ⚠ Edit $app_dir/.env and fill in:"
    echo "      SHOPIFY_API_KEY     (from Partners dashboard)"
    echo "      SHOPIFY_API_SECRET  (from Partners dashboard)"
  fi
done

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║                     Setup complete!                      ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
echo "Next steps:"
echo ""
echo "1. Fill in .env files with API keys from Partner dashboard:"
echo "   https://partners.shopify.com/organizations"
echo ""
echo "2. Run any app against $DEV_STORE:"
echo "   cd $WORKTREES_PARENT/klyna-shopify-bundles/apps/shopify-bundles"
echo "   pnpm dev -- --store=$DEV_STORE"
echo ""
