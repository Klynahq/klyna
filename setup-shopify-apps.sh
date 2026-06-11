#!/usr/bin/env bash
# ============================================================
# Klyna — Shopify App Setup Script
# ============================================================
# Run this ONCE to:
#   1. Log into Shopify Partners (browser OAuth)
#   2. Create each app in your Partner dashboard via the API
#   3. Link each app using the client_id (fully non-interactive)
#   4. Install dependencies + generate Prisma clients
#
# Requirements:
#   - Shopify CLI 3+ (brew install shopify-cli OR npm i -g @shopify/cli)
#   - pnpm (corepack enable pnpm)
#   - node (comes with Shopify CLI)
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

# Step 2: Create apps via Partners API + link each one
echo "─── Step 2: Creating apps in Partners dashboard ───"
echo ""

# Use Node.js to create apps via the Partners API (avoids interactive CLI prompts).
# Reads the access token from Shopify CLI's own session store (~/.../config.json).
node - "$WORKTREES_PARENT" "$DEV_STORE" "${APPS[@]}" <<'NODEJS'
const { execSync, spawnSync } = require('child_process');
const fs   = require('fs');
const path = require('path');
const https = require('https');

const [,, worktreesParent, devStore, ...apps] = process.argv;

// ── 1. Read the CLI session token ──────────────────────────────────────────
const cfgPath = path.join(
  process.env.HOME,
  'Library/Preferences/shopify-cli-kit-nodejs/config.json'
);
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const sessionRaw = cfg.sessionStore;
const session = JSON.parse(sessionRaw);
const accounts = session['accounts.shopify.com'] || {};
const userId   = cfg.currentSessionId;
const identity = accounts[userId]?.identity;
if (!identity?.accessToken) {
  console.error('No access token found. Run `shopify auth login` first.');
  process.exit(1);
}
const token = identity.accessToken;

// ── 2. Get Partners org ID ─────────────────────────────────────────────────
function gqlPartners(query, variables = {}) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query, variables });
    const req  = https.request({
      hostname: 'partners.shopify.com',
      path:     '/api/2024-10/graphql.json',
      method:   'POST',
      headers:  {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`,
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error(`Parse error: ${data.slice(0,200)}`)); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// App name mapping (no "Shopify" — Shopify Partners rejects that word)
const APP_NAMES = {
  'shopify-bundles':     'Klyna Bundles',
  'shopify-upsell':      'Klyna Upsell',
  'shopify-rewards':     'Klyna Rewards',
  'shopify-reviews':     'Klyna Reviews',
  'shopify-urgency':     'Klyna Urgency',
  'shopify-restock':     'Klyna Back-in-Stock',
  'shopify-wishlist':    'Klyna Wishlist',
  'shopify-feed':        'Klyna Feed',
  'shopify-sticky-cart': 'Klyna Sticky Cart',
  'shopify-capture':     'Klyna Capture',
};

(async () => {
  // Get org ID
  const orgRes = await gqlPartners(`{
    currentUserAccount {
      organization { id name }
    }
  }`);
  const orgGid = orgRes?.data?.currentUserAccount?.organization?.id;
  if (!orgGid) {
    console.error('Could not get organization ID:', JSON.stringify(orgRes));
    process.exit(1);
  }
  console.log(`✓ Organization: ${orgRes.data.currentUserAccount.organization.name} (${orgGid})`);

  for (const slug of apps) {
    const appDir  = path.join(worktreesParent, `klyna-${slug}`, 'apps', slug);
    const appName = APP_NAMES[slug] || `Klyna ${slug.replace('shopify-', '')}`;

    if (!fs.existsSync(appDir)) {
      console.log(`⚠  Worktree not found: ${appDir} — skipping`);
      continue;
    }

    console.log(`\n─── Setting up: ${slug} ───`);

    // Install deps
    process.stdout.write('  Installing dependencies...');
    spawnSync('pnpm', ['install', '--silent'], { cwd: appDir, stdio: 'inherit' });
    process.stdout.write(' ✓\n');

    // Generate Prisma client
    process.stdout.write('  Generating Prisma client...');
    spawnSync('npx', ['prisma', 'generate'], { cwd: appDir, stdio: 'ignore' });
    process.stdout.write(' ✓\n');

    // Check if already linked (has a real client_id)
    const tomlPath = path.join(appDir, 'shopify.app.toml');
    const tomlRaw  = fs.readFileSync(tomlPath, 'utf8');
    const existing = tomlRaw.match(/^client_id\s*=\s*"([^"]+)"/m)?.[1];
    if (existing && !existing.startsWith('REPLACE')) {
      console.log(`  ✓ Already linked (client_id: ${existing.slice(0, 16)}...)`);
    } else {
      // Create app via Partners API
      process.stdout.write(`  Creating "${appName}" in Partners dashboard...`);
      const createRes = await gqlPartners(`
        mutation AppCreate($org: ID!, $title: String!, $url: String!, $redirects: [Url!]!) {
          appCreate(
            organizationId: $org
            app: { title: $title, applicationUrl: $url, redirectUrlWhitelist: $redirects }
          ) {
            app { apiKey apiSecretKeys { secret } }
            userErrors { field message }
          }
        }
      `, {
        org:       orgGid,
        title:     appName,
        url:       'https://klyna.dev',
        redirects: [
          'https://klyna.dev/auth/callback',
          'https://klyna.dev/auth/shopify/callback',
          'https://klyna.dev/api/auth/callback',
        ],
      });

      const errs   = createRes?.data?.appCreate?.userErrors ?? [];
      const apiKey = createRes?.data?.appCreate?.app?.apiKey;
      const secret = createRes?.data?.appCreate?.app?.apiSecretKeys?.[0]?.secret;

      if (errs.length) {
        console.error(`\n  ✗ API error: ${errs.map(e => e.message).join(', ')}`);
        console.error('    Run manually: cd "' + appDir + '" && shopify app config link');
        continue;
      }

      process.stdout.write(` ✓  (${apiKey})\n`);

      // Link the toml to this client_id (non-interactive: --client-id bypasses all prompts)
      process.stdout.write('  Linking toml to Partners app...');
      const linkResult = spawnSync(
        'shopify', ['app', 'config', 'link', '--client-id', apiKey, '--config', 'shopify.app.toml'],
        { cwd: appDir, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' }
      );
      if (linkResult.status !== 0) {
        console.error(`\n  ✗ config link failed:\n${linkResult.stderr}`);
        // Fall back: manually write the client_id into the toml
        const updated = tomlRaw.replace(
          /^client_id\s*=\s*"[^"]*"/m,
          `client_id = "${apiKey}"`
        );
        fs.writeFileSync(tomlPath, updated);
        console.log('  ↳ Wrote client_id directly to shopify.app.toml as fallback');
      } else {
        process.stdout.write(' ✓\n');
      }

      // Write .env with API key + secret
      const envPath = path.join(appDir, '.env');
      const envExample = path.join(appDir, '.env.example');
      if (!fs.existsSync(envPath)) {
        let envContent = fs.existsSync(envExample)
          ? fs.readFileSync(envExample, 'utf8')
          : 'SHOPIFY_API_KEY=\nSHOPIFY_API_SECRET=\n';
        envContent = envContent
          .replace(/^SHOPIFY_API_KEY=.*/m, `SHOPIFY_API_KEY=${apiKey}`)
          .replace(/^SHOPIFY_API_SECRET=.*/m, `SHOPIFY_API_SECRET=${secret || ''}`);
        fs.writeFileSync(envPath, envContent);
        console.log('  ✓ Created .env with API key + secret');
      }
    }

    console.log(`  ✓ ${slug} ready`);
  }

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║                     Setup complete!                      ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`To run any app against ${devStore}:`);
  console.log(`  cd ${worktreesParent}/klyna-<slug>/apps/<slug>`);
  console.log(`  pnpm dev -- --store=${devStore}`);
  console.log('');
  console.log('Example — run Klyna Bundles:');
  console.log(`  cd ${worktreesParent}/klyna-shopify-bundles/apps/shopify-bundles`);
  console.log(`  pnpm dev -- --store=${devStore}`);
  console.log('');
})().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
NODEJS
