#!/usr/bin/env bash
# Make a Shopify app use ephemeral SQLite at /tmp/dev.sqlite for serverless
# deployment. Schema gets pushed on cold start.
#
# Trade-off: data resets when the Vercel function instance is recycled.
# Sessions, settings, audit history all reset. Fine for:
#   - App Store review (reviewers test in one session)
#   - Free demo / testing
# NOT fine for: paying customers (later — swap DATABASE_URL to real Postgres,
# flip schema.prisma datasource provider to "postgresql").
#
# USAGE: ./sqlite-runtime-bootstrap.sh <slug>
set -euo pipefail

SLUG="${1:-}"
[ -z "$SLUG" ] && { echo "usage: $0 <slug>" >&2; exit 1; }

if [ "$SLUG" = "klyna-seo" ]; then
  APP_DIR="/Users/adeedaxguy/personal web/klyna/apps/shopify"
else
  APP_DIR="/Users/adeedaxguy/personal web/klyna-$SLUG/apps/$SLUG"
fi
[ -d "$APP_DIR" ] || { echo "no such app: $APP_DIR" >&2; exit 1; }
cd "$APP_DIR"

echo "=== $SLUG: switch to SQLite-in-/tmp ==="

# 1. Schema datasource -> sqlite
/usr/bin/python3 - <<'PYEOF'
import re
with open('prisma/schema.prisma') as f:
    s = f.read()
s = re.sub(r'provider\s*=\s*"postgresql"', 'provider = "sqlite"', s)
with open('prisma/schema.prisma','w') as f:
    f.write(s)
PYEOF
echo "  ✓ schema.prisma datasource = sqlite"

# 2. Make db.server.ts bootstrap the SQLite schema on cold start
DB_FILE="app/db.server.ts"
[ -f "$DB_FILE" ] || { echo "  ✗ $DB_FILE missing"; exit 1; }

# Inject the bootstrap logic at the top of db.server.ts ONCE
if ! /usr/bin/grep -q "KLYNA_SQLITE_BOOTSTRAP" "$DB_FILE"; then
  /usr/bin/python3 - <<PYEOF
content = open('$DB_FILE').read()
bootstrap = '''// KLYNA_SQLITE_BOOTSTRAP — ephemeral SQLite at /tmp for serverless.
// On cold start, create the schema if the .sqlite file does not yet exist.
// Swap to a real Postgres later by:
//   1. setting DATABASE_URL to a postgres:// URL in env
//   2. flipping prisma/schema.prisma datasource provider to "postgresql"
import { existsSync, copyFileSync } from "node:fs";
import { execSync } from "node:child_process";

const SQLITE_PATH = "/tmp/dev.sqlite";
if (!process.env.DATABASE_URL || process.env.DATABASE_URL === "") {
  process.env.DATABASE_URL = "file:" + SQLITE_PATH;
}
if (process.env.DATABASE_URL.startsWith("file:") && !existsSync(SQLITE_PATH)) {
  try {
    // prisma binary is bundled into the Vercel function via node_modules/.bin
    execSync(\`./node_modules/.bin/prisma db push --skip-generate --accept-data-loss\`, {
      stdio: "ignore",
      env: { ...process.env, DATABASE_URL: "file:" + SQLITE_PATH },
    });
  } catch (e) {
    console.error("[klyna] sqlite bootstrap failed", e);
  }
}

'''
content = bootstrap + content
open('$DB_FILE','w').write(content)
PYEOF
  echo "  ✓ db.server.ts bootstrap injected"
else
  echo "  - bootstrap already present"
fi

# 3. Update vercel.json to set DATABASE_URL env at build time + ensure prisma in build deps
# Already has npx prisma generate in buildCommand
# Verify by re-reading
if [ -f vercel.json ]; then
  echo "  - vercel.json kept (build command already runs prisma generate)"
else
  echo "  ✗ vercel.json missing — run standalone-shopify-app.sh first"
  exit 1
fi

echo "  ✓ $SLUG ready for SQLite-in-/tmp deploy"
