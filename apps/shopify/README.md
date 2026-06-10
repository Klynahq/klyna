# Klyna for Shopify

Organic growth tools for Shopify merchants. Schema markup, internal linking,
SEO + GEO audits — built on the official Shopify App Remix template, with
the Klyna shared engine plugged in.

## ⚠️ What you need before running

This app requires a Shopify Partner account because the OAuth flow can't
work without app credentials. The build itself is fully scaffolded.

1. **Shopify Partner account** — free at <https://partners.shopify.com>
2. **A development store** — create one from the Partner dashboard
3. **Shopify CLI 3** — install once globally:
   ```bash
   pnpm add -g @shopify/cli@latest
   ```

## First-time setup

```bash
cd apps/shopify

# 1. Install deps
pnpm install

# 2. Create the Prisma SQLite DB for session storage
cp .env.example .env
pnpm prisma:generate
pnpm prisma:migrate   # creates dev.sqlite

# 3. Link to a Shopify app (creates one in your Partner account or links to existing)
pnpm shopify app config link
# → choose "Create a new app" → name it "Klyna for Shopify"
# → the CLI rewrites shopify.app.toml with your real client_id

# 4. Copy the API key + secret from your Partner dashboard into .env
#    (Settings → Apps → Klyna for Shopify → API credentials)

# 5. Start the dev server (tunnels through Cloudflare Quick Tunnel)
pnpm dev
# → press 'p' to open the dev store with the app pre-installed
```

## Project layout

```
apps/shopify/
├── shopify.app.toml          # Shopify app config — CLI rewrites client_id
├── shopify.web.toml          # Tells the Shopify CLI how to run the web role
├── vite.config.ts
├── prisma/schema.prisma      # Session storage (SQLite locally)
├── app/
│   ├── shopify.server.ts     # @shopify/shopify-app-remix init
│   ├── db.server.ts          # PrismaClient singleton
│   ├── root.tsx              # HTML shell
│   ├── entry.server.tsx      # Remix SSR entry
│   └── routes/
│       ├── _index/             # Public landing (when shop param is absent)
│       ├── auth.$.tsx          # OAuth callback (catch-all)
│       ├── auth.login.tsx      # Manual login form
│       ├── app.tsx             # Embedded app shell + NavMenu
│       ├── app._index.tsx      # Dashboard
│       ├── app.audit.tsx       # Audit feature (uses @klyna/core)
│       ├── app.schema.tsx      # Schema (planned)
│       ├── app.links.tsx       # Internal links (planned)
│       └── webhooks.app.uninstalled.tsx
```

## What works v0.1

- **OAuth + embedded admin** (out of the box once credentials are in place)
- **Storefront audit** (`/app/audit`) — fetches a URL, runs the full Klyna
  audit engine on it, displays score + findings, persists each run to SQLite

## What ships next

- **Schema markup module** (`/app/schema`) — auto-inject product, collection,
  org, FAQ schema via theme app extension
- **Internal links module** (`/app/links`) — TF-IDF across products, collections,
  and pages, with theme-extension-based injection
- **Webhooks** — listen to product/page updates to invalidate audit cache
- **Billing** — Shopify managed pricing, free tier with limits

## Deploy

When ready to publish to the App Store:

```bash
pnpm shopify app deploy
```

The CLI bundles the app, uploads to Shopify, and creates a new version draft
for the App Store review process.

## Architecture notes

- **Session storage** uses Prisma + SQLite locally. For production, swap
  `DATABASE_URL` to a Postgres URL (Supabase, Neon, Railway, Fly Postgres —
  any work) and `pnpm prisma:migrate`.
- **No paid APIs** — every audit, every analysis runs locally on whatever
  Node host the app is deployed to. The Shopify Admin API is free.
- **The shared engine** — `@klyna/core` is imported directly from the
  monorepo. Improvements in the browser extension lift this app and vice
  versa.
