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

# 2. Configure Prisma session storage
cp .env.example .env
pnpm prisma:generate
pnpm prisma:migrate

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
├── prisma/schema.prisma      # Session storage + audit state (Postgres)
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
│       ├── app.schema.tsx      # JSON-LD schema settings + snippets
│       ├── app.links.tsx       # Internal link suggestions
│       ├── app.bulk.tsx        # Store-wide audit runner
│       ├── app.geo.tsx         # GEO score + llms.txt generator
│       ├── app.meta-editor.tsx # Bulk SEO metadata editor
│       ├── app.alt-text.tsx    # Product image alt text editor
│       ├── app.keywords.tsx    # Keyword gap helper
│       ├── app.vitals.tsx      # PageSpeed Insights checker
│       ├── app.canonical.tsx   # Canonical URL checks
│       ├── app.competitor.tsx  # Competitor page comparison
│       └── webhooks.app.uninstalled.tsx
```

## What works

- **OAuth + embedded admin** (out of the box once credentials are in place)
- **Storefront audit** (`/app/audit`) — fetches a URL, runs the full Klyna
  audit engine on it, displays score + findings, and persists each run
- **Bulk Store Audit** (`/app/bulk`) — scans homepage, products, collections,
  and pages, using Shopify `onlineStoreUrl` as the canonical URL when available
- **Schema Markup** (`/app/schema`) — saves schema settings and generates
  Organization, WebSite, Product, BreadcrumbList, and FAQ JSON-LD snippets
- **Internal Links** (`/app/links`) — TF-IDF suggestions and orphan detection
  across products, collections, and content pages
- **GEO Score** (`/app/geo`) — entity/trust/content scoring plus an
  `llms.txt` generator for AI crawlers
- **Meta Bulk Editor** (`/app/meta-editor`) — edits product and collection SEO
  fields through Shopify Admin API, with page metadata handled via metafields
- **Image Alt Text** (`/app/alt-text`) — product image alt text audit and editor
- **Keywords, Web Vitals, Canonicals, Competitors** — focused analysis modules
  for deeper store optimization
- **GDPR webhooks** — app uninstall and customer/shop privacy endpoints

## Deploy

When ready to publish to the App Store:

```bash
pnpm shopify app deploy
```

The CLI bundles the app, uploads to Shopify, and creates a new version draft
for the App Store review process.

## Architecture notes

- **Session storage** uses Prisma + Postgres. Production expects
  `DATABASE_URL` for pooled runtime access and `DIRECT_URL` for Prisma schema
  sync during deploy.
- **No paid APIs** — every audit, every analysis runs locally on whatever
  Node host the app is deployed to. The Shopify Admin API is free.
- **The shared engine** — `@klyna/core` is imported directly from the
  monorepo. Improvements in the browser extension lift this app and vice
  versa.
