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
# Uses a case statement instead of declare -A to stay compatible with macOS bash 3.2.
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
    *)                   echo "Klyna $(echo "$1" | sed 's/shopify-//' | sed 's/-/ /g' | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) substr($i,2)}1')" ;;
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
  app_name="$(app_name_for "$slug")"

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

  # Link to Partner dashboard using expect to drive the interactive prompts.
  # The CLI requires a real TTY — piped stdin is rejected. expect fakes one.
  # Prompts handled:
  #   "Create new app" / "Connect to an existing app" → choose Create (1)
  #   "App name:"                                      → send $app_name
  echo "  Linking to Shopify Partner dashboard..."
  (cd "$app_dir" && /usr/bin/expect -c "
    set timeout 90
    log_user 1
    spawn shopify app config link --config shopify.app.toml
    expect {
      -re {App name[^:]*:} {
        send \"$app_name\r\"
        exp_continue
      }
      -re {[Cc]reate new} {
        send \"1\r\"
        exp_continue
      }
      -re {connect.*existing} {
        send \"1\r\"
        exp_continue
      }
      eof {}
      timeout { exit 1 }
    }
    catch wait result
    exit [lindex \$result 3]
  ") || {
    echo ""
    echo "  ⚠  Auto-link failed for $slug. Run manually in a new terminal:"
    echo "     cd \"$app_dir\""
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
