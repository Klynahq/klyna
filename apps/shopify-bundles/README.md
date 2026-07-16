# Klyna Bundles

Build product bundles and quantity breaks in the admin, then show the
discounted price right on the product page with a theme app extension.

Part of [Klyna](https://klyna.dev) — _tools that help your work get found._

## What it does

- **Bundle builder** — group products into a **fixed set** (sold together) or a
  **mix-and-match** offer (customer picks N from a pool). Pick products from a
  live catalog search, set per-item quantities, and choose a percentage or
  fixed-amount discount. A price preview shows the exact savings — the same math
  the storefront renders.
- **Volume / quantity-break tiers** — add a "buy more, save more" ladder to any
  product ("buy 3+ save 5%, buy 10+ save 15%"). A live table previews the
  effective unit price at each break point.
- **Storefront widget** — a theme app extension block renders the bundle,
  volume table, and one-click "add bundle to cart" via the AJAX cart API.
- **Launch-safe privacy posture** — core bundles and volume tiers work without
  protected customer/order data access. Order-history recommendations are kept
  disabled until protected data access is approved.
- **Settings** — default discount type, storefront price display (single total
  vs. per-item strikethrough), widget headings, accent color, and savings badge.

When a bundle or volume tier is activated, Klyna creates a native **automatic
discount** so the promised saving is actually enforced at checkout — the app
never just _shows_ a price it can't honor.

## ⚠️ What you need before running

This app requires a Shopify Partner account because the OAuth flow can't work
without app credentials. The build itself is fully scaffolded.

1. **Shopify Partner account** — free at <https://partners.shopify.com>
2. **A development store** — create one from the Partner dashboard
3. **Shopify CLI 3** — install once globally:
   ```bash
   pnpm add -g @shopify/cli@latest
   ```

## First-time setup

```bash
cd apps/shopify-bundles

# 1. Install deps
pnpm install

# 2. Create the Prisma SQLite DB for session + bundle storage
cp .env.example .env
pnpm prisma:generate
pnpm prisma:migrate   # applies the Postgres schema

# 3. Link to a Shopify app (creates one in your Partner account or links to existing)
pnpm shopify app config link
# → choose "Create a new app" → name it "Klyna Bundles"
# → the CLI rewrites shopify.app.toml with your real client_id

# 4. Copy the API key + secret from your Partner dashboard into .env
#    (Settings → Apps → Klyna Bundles → API credentials)

# 5. Start the dev server (tunnels through Cloudflare Quick Tunnel)
pnpm dev
# → press 'p' to open the dev store with the app pre-installed
```

Then, in the dev store's theme editor, add the **Klyna Bundles** block to the
product template (Add block → Apps) so the storefront widget renders.

## Project layout

```
apps/shopify-bundles/
├── shopify.app.toml              # Shopify app config — CLI rewrites client_id
├── shopify.web.toml              # Tells the Shopify CLI how to run the web role
├── vite.config.ts
├── prisma/schema.prisma          # Session + Bundle/VolumeTier/FbtPair/Sales models
├── app/
│   ├── shopify.server.ts         # @shopify/shopify-app-remix init
│   ├── db.server.ts              # PrismaClient singleton
│   ├── root.tsx                  # HTML shell
│   ├── entry.server.tsx          # Remix SSR entry
│   ├── assets/logo.svg           # Product mark (three stacked squares)
│   ├── lib/
│   │   ├── pricing.ts            # Pure bundle + volume discount math (shared)
│   │   ├── fbt.ts                # Frequently-bought-together miner
│   │   ├── admin.server.ts       # Shopify Admin GraphQL helpers
│   │   └── settings.server.ts    # ShopSettings accessor
│   └── routes/
│       ├── _index/                 # Public landing (when shop param is absent)
│       ├── auth.$.tsx              # OAuth callback (catch-all)
│       ├── auth.login.tsx          # Manual login form
│       ├── app.tsx                 # Embedded app shell + NavMenu
│       ├── app._index.tsx          # Dashboard + launch metrics shell
│       ├── app.bundles._index.tsx  # Bundle list
│       ├── app.bundles.$id.tsx     # Bundle builder (new + edit)
│       ├── app.volume.tsx          # Volume / quantity-break tiers
│       ├── app.fbt.tsx             # Protected-data FBT placeholder
│       ├── app.settings.tsx        # Discount + display settings
│       ├── api.storefront.tsx      # App-proxy data endpoint for the widget
│       ├── webhooks.app.uninstalled.tsx
│       └── webhooks.orders.create.tsx  # Revenue attribution
└── extensions/
    └── klyna-bundles-block/        # Theme app extension (storefront widget)
        ├── shopify.extension.toml
        ├── blocks/bundle.liquid
        └── assets/{klyna-bundles.js, klyna-bundles.css}
```

## How the pieces fit

- **Admin (Remix + Polaris)** writes bundles, tiers, and settings to Postgres
  via Prisma, and reads the catalog through the Admin GraphQL API.
- **App proxy** (`/apps/klyna-bundles` → `/api/storefront`) serves the public,
  read-only data the storefront block needs, authenticated by Shopify's proxy
  signature — no admin session is exposed.
- **Theme app extension** is plain Liquid + vanilla JS/CSS; it fetches the proxy
  and hydrates the product page, then uses the AJAX cart API to add bundles.
- **Protected-data features** such as order-history FBT and revenue attribution
  are scaffolded, but not enabled in the launch scope.
- **Pricing is shared.** `app/lib/pricing.ts` is the single source of truth, so
  the admin preview and the live widget can never disagree.

## STATUS

**Feature-complete for launch-scope testing; needs live Partner configuration
and App Store screenshots before submission.** Honest notes:

- ✅ OAuth + embedded admin, Prisma session storage, uninstall webhook
- ✅ Bundle builder (fixed + mix-and-match) with live catalog search and a
      shared price preview; persists to Prisma
- ✅ Volume-break tier editor with live preview; creates native automatic
      discounts on save
- ✅ Theme app extension block (bundle + volume) wired to the app proxy,
      with AJAX add-to-cart
- ✅ Settings for discount type + storefront display
- ⚠️ **Automatic-discount creation** uses `discountAutomaticBasicCreate`. On a
      live store, verify the discount appears under Discounts → Automatic. The
      builder saves a bundle as **draft** (not active) if the discount call
      fails, so the admin never shows an unenforceable price.
- 🔜 Not yet: protected-data FBT, order-attribution analytics, scheduled FBT
      refresh, Shopify Functions-based bundle pricing, and managed billing.

## Deploy

```bash
pnpm shopify app deploy
```

The CLI bundles the app + theme extension, uploads to Shopify, and creates a new
version draft for App Store review.

## Architecture notes

- **Session + app storage** use Prisma + SQLite locally. For production, point
  `DATABASE_URL` at Postgres (Supabase, Neon, Railway, Fly) and
  `pnpm prisma:migrate`.
- **No paid APIs.** Catalog search and discount creation run against the free
  Shopify Admin API. Future FBT analysis is local market-basket analysis — no
  third-party ML service.
