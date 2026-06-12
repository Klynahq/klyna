#!/usr/bin/env bash
# Deploy a single Klyna Shopify app end-to-end.
#
# USAGE:
#   SHOPIFY_API_SECRET=shpss_xxx \
#   DATABASE_URL=postgres://... \
#   ./scripts/deploy-shopify-app.sh shopify-bundles
#
# WHAT IT DOES:
#   1. Reads SHOPIFY_API_KEY + SCOPES from this app's shopify.app.toml
#   2. Sets all 5 prod env vars on the Vercel project
#   3. Deploys to Vercel
#   4. Updates application_url + redirect_urls in the toml to the prod URL
#   5. Runs `shopify app deploy --force` to push the version to Partners
#   6. Commits + pushes the toml change to the feat/<slug> branch
#
# REQUIRES (in shell environment):
#   SHOPIFY_API_SECRET   from Partners dashboard
#   DATABASE_URL         from `vercel storage create` (Step A in TOMORROW.md)
#
# OPTIONAL:
#   RESEND_API_KEY       if the app sends emails (most don't — leave unset)

set -euo pipefail

SLUG="${1:-}"
if [ -z "$SLUG" ]; then
  echo "Usage: $0 <shopify-app-slug>" >&2
  exit 1
fi

if [ -z "${SHOPIFY_API_SECRET:-}" ] || [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: SHOPIFY_API_SECRET and DATABASE_URL must be set in your shell." >&2
  echo "  export SHOPIFY_API_SECRET=shpss_<from Partners dashboard>" >&2
  echo "  export DATABASE_URL=postgres://<from vercel storage create>" >&2
  exit 1
fi

# Resolve paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKTREES_PARENT="$(dirname "$(dirname "$SCRIPT_DIR")")"

# The Klyna SEO app lives inside the main repo
if [ "$SLUG" = "klyna-seo" ]; then
  WORKTREE="$WORKTREES_PARENT/klyna"
  APP_DIR="$WORKTREE/apps/shopify"
  BRANCH="main"
  PROJECT_NAME="klyna-seo"
else
  WORKTREE="$WORKTREES_PARENT/klyna-$SLUG"
  APP_DIR="$WORKTREE/apps/$SLUG"
  BRANCH="feat/$SLUG"
  # Some projects on Vercel use shortened names — check both
  PROJECT_NAME="klyna-$SLUG"
fi

if [ ! -d "$APP_DIR" ]; then
  echo "ERROR: app dir not found: $APP_DIR" >&2
  exit 1
fi

cd "$APP_DIR"

echo "=== $SLUG ==="
echo "  app dir: $APP_DIR"
echo "  project: $PROJECT_NAME"

# Extract API key + scopes from toml
SHOPIFY_API_KEY=$(grep "^client_id" shopify.app.toml | head -1 | sed 's/.*"\([^"]*\)".*/\1/')
SCOPES=$(grep "^scopes" shopify.app.toml | head -1 | sed 's/.*"\([^"]*\)".*/\1/')

if [ -z "$SHOPIFY_API_KEY" ] || [[ "$SHOPIFY_API_KEY" == REPLACE* ]]; then
  echo "ERROR: shopify.app.toml does not have a real client_id. Did you run `shopify app config link`?" >&2
  exit 1
fi

SHOPIFY_APP_URL="https://${PROJECT_NAME}.vercel.app"

echo "  SHOPIFY_API_KEY: ${SHOPIFY_API_KEY:0:16}..."
echo "  SHOPIFY_APP_URL: $SHOPIFY_APP_URL"
echo "  SCOPES: $SCOPES"

# Ensure linked to the right Vercel project
if [ ! -d ".vercel" ]; then
  echo "  Linking to Vercel project $PROJECT_NAME..."
  vercel link --yes --project "$PROJECT_NAME"
fi

# Set env vars (production scope). --force overwrites if already present.
echo "  Setting env vars..."
echo "$SHOPIFY_API_KEY"    | vercel env add SHOPIFY_API_KEY production --force >/dev/null
echo "$SHOPIFY_API_SECRET" | vercel env add SHOPIFY_API_SECRET production --force >/dev/null
echo "$SCOPES"             | vercel env add SCOPES production --force >/dev/null
echo "$SHOPIFY_APP_URL"    | vercel env add SHOPIFY_APP_URL production --force >/dev/null
echo "$DATABASE_URL"       | vercel env add DATABASE_URL production --force >/dev/null
echo "  ✓ 5 env vars set"

# Install + generate + build locally first (catches typecheck/build errors before burning a deploy)
echo "  pnpm install..."
pnpm install --silent
echo "  prisma generate..."
npx prisma generate >/dev/null
echo "  pnpm tsc --noEmit..."
pnpm tsc --noEmit
echo "  pnpm build..."
pnpm build >/dev/null

# Deploy to Vercel
echo "  vercel deploy --prod..."
DEPLOY_URL=$(vercel deploy --prod --yes 2>&1 | grep -oE 'https://[a-z0-9.-]+\.vercel\.app' | head -1)
echo "  ✓ deployed to: $DEPLOY_URL"

# Update toml to the production URL
sed -i.bak "s|^application_url = .*|application_url = \"$SHOPIFY_APP_URL\"|" shopify.app.toml
# Also update redirect URLs
python3 - <<PYEOF
import re
with open('shopify.app.toml') as f:
    s = f.read()
new_redirects = '''redirect_urls = [
  "$SHOPIFY_APP_URL/auth/callback",
  "$SHOPIFY_APP_URL/auth/shopify/callback",
  "$SHOPIFY_APP_URL/api/auth/callback",
]'''.replace('\$SHOPIFY_APP_URL', '$SHOPIFY_APP_URL')
s = re.sub(r'redirect_urls\s*=\s*\[[^\]]+\]', new_redirects, s)
with open('shopify.app.toml','w') as f:
    f.write(s)
PYEOF
rm -f shopify.app.toml.bak

# Push the new version to Partner dashboard
echo "  shopify app deploy..."
shopify app deploy --force --message "App Store readiness: GDPR webhooks, Postgres sessions, production hosting"

# Commit + push
cd "$WORKTREE"
git add -A
if ! git diff --cached --quiet; then
  git commit -m "feat(deploy): production URL + shopify app deploy for $SLUG"
  git push origin "$BRANCH"
  echo "  ✓ committed + pushed"
fi

echo ""
echo "=== $SLUG DONE ==="
echo "  Live at: $SHOPIFY_APP_URL"
echo ""
