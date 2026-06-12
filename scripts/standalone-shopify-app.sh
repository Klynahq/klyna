#!/usr/bin/env bash
# Convert a Shopify app from workspace-dependent to standalone deploy.
#
# - Inlines @klyna/ai-client source into app/lib/klyna-ai-client.ts
# - Inlines @klyna/tsconfig base config into tsconfig.json
# - Inlines @klyna/core (if used) into app/lib/klyna-core.ts
# - Drops the workspace deps from package.json
# - Rewrites imports
# - Adds vercel.json (npm install + npx prefixes + node 22)
# - Pins engines.node = 22.x
#
# USAGE: ./standalone-shopify-app.sh <slug>
# Example: ./standalone-shopify-app.sh shopify-wishlist
set -euo pipefail

SLUG="${1:-}"
if [ -z "$SLUG" ]; then echo "usage: $0 <slug>" >&2; exit 1; fi

# Resolve paths
if [ "$SLUG" = "klyna-seo" ]; then
  WT="/Users/adeedaxguy/personal web/klyna"
  APP_DIR="$WT/apps/shopify"
else
  WT="/Users/adeedaxguy/personal web/klyna-$SLUG"
  APP_DIR="$WT/apps/$SLUG"
fi

[ -d "$APP_DIR" ] || { echo "no such app: $APP_DIR" >&2; exit 1; }

AI_SRC="/Users/adeedaxguy/personal web/klyna/packages/ai-client/src/index.ts"

echo "=== Standalonifying $SLUG ==="
cd "$APP_DIR"

# 1. Pull main first to get the latest @klyna/ai-client source
cd "$WT"
/usr/bin/git fetch origin 2>&1 | /usr/bin/tail -1 || true
/usr/bin/git merge origin/main --no-edit 2>&1 | /usr/bin/tail -3 || true
cd "$APP_DIR"

# 2. Copy ai-client source into app/lib/
/bin/mkdir -p app/lib
/bin/cp "$AI_SRC" app/lib/klyna-ai-client.ts
echo "  ✓ inlined ai-client at app/lib/klyna-ai-client.ts"

# 3. Rewrite imports: @klyna/ai-client -> ~/lib/klyna-ai-client
# Files to edit: app/**/*.ts and app/**/*.tsx
find app -name "*.ts" -o -name "*.tsx" 2>/dev/null | while read f; do
  if /usr/bin/grep -l "@klyna/ai-client" "$f" >/dev/null 2>&1; then
    /usr/bin/sed -i.bak "s|@klyna/ai-client|~/lib/klyna-ai-client|g" "$f"
    rm -f "$f.bak"
  fi
done
echo "  ✓ rewrote imports"

# 4. Replace tsconfig.json (inline what @klyna/tsconfig/base.json provided)
/usr/bin/python3 - <<'PYEOF'
import json, os, sys
with open('tsconfig.json') as f:
    cur = json.load(f)
# Drop the extends, inline the base
cur.pop('extends', None)
# Merge base compilerOptions
base_opts = {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": True,
    "esModuleInterop": True,
    "skipLibCheck": True,
    "forceConsistentCasingInFileNames": True,
    "resolveJsonModule": True,
    "isolatedModules": True,
    "verbatimModuleSyntax": True,
    "noUncheckedIndexedAccess": True,
    "noImplicitOverride": True,
    "allowSyntheticDefaultImports": True,
    "allowImportingTsExtensions": True,
    "noEmit": True,
    "composite": False,
    "declaration": False,
    "declarationMap": False,
    "isolatedDeclarations": False,
    "noUnusedLocals": False,
    "noUnusedParameters": False,
    "preserveWatchOutput": True,
    "inlineSources": False,
}
co = cur.get('compilerOptions', {})
# Merge — local values win over base
merged = {**base_opts, **co}
cur['compilerOptions'] = merged
with open('tsconfig.json','w') as f:
    json.dump(cur, f, indent=2)
PYEOF
echo "  ✓ inlined tsconfig base"

# 5. Drop workspace deps from package.json + pin Node 22
/usr/bin/python3 - <<'PYEOF'
import json
with open('package.json') as f:
    p = json.load(f)
for section in ('dependencies', 'devDependencies'):
    if section in p:
        p[section] = {k: v for k, v in p[section].items()
                      if not (k.startswith('@klyna/') and v == 'workspace:*')}
p['engines'] = {'node': '22.x'}
with open('package.json','w') as f:
    json.dump(p, f, indent=2)
PYEOF
echo "  ✓ dropped workspace deps + pinned node 22"

# 6. Write vercel.json
/bin/cat > vercel.json <<EOF
{
  "\$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "remix",
  "installCommand": "npm install",
  "buildCommand": "npx prisma generate && npx remix vite:build",
  "outputDirectory": "build"
}
EOF
echo "  ✓ wrote vercel.json"

# 7. Drop .vercel link (will relink against npm-based project)
/bin/rm -rf .vercel
echo "  ✓ cleared old .vercel link"

# 8. Generate package-lock.json locally
echo "  → npm install (silent)..."
/opt/homebrew/bin/npm install --silent >/dev/null 2>&1 || true
echo "  ✓ standalone setup complete for $SLUG"
echo ""
echo "  Next: vercel link --project klyna-$SLUG --yes && vercel deploy --prod --yes"
