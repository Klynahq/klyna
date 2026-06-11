# Klyna Sticky Cart

Sticky add-to-cart, quick-buy & free-shipping progress bar for Shopify.

A persistent add-to-cart bar follows shoppers down the product page — with
variant + quantity selection, one-tap quick-buy, and a free-shipping progress
bar that nudges bigger carts. Fully mobile-optimized, with built-in click
analytics. Built on the official Shopify App Remix template (Remix + App Bridge
+ Polaris) plus a Theme App Extension for the storefront widget.

> Part of the Klyna studio — _Tools that help your work get found._

## Features

- **Persistent sticky add-to-cart bar** on the product page, delivered as a
  Theme App Extension app embed (no theme code to edit).
- **Variant + quantity selectors** right in the bar — change options without
  scrolling back up.
- **Quick-buy** — a secondary button that adds the item and jumps straight to
  checkout.
- **Free-shipping progress bar** with a configurable threshold and live
  messaging (`You're $X away from free shipping!` → `You've unlocked free
  shipping!`), updating as the cart total changes.
- **Fully mobile-optimized** — a full-width tray on phones, a compact row on
  desktop, with safe-area insets and reduced-motion support.
- **Click analytics** — impressions, add-to-cart rate, quick-buy rate, variant
  / quantity changes, and free-shipping unlocks, plus a top-products leaderboard.

## How it fits together

```
Admin (embedded Polaris app)            Storefront (Theme App Extension)
─────────────────────────────          ─────────────────────────────────
/app                 Dashboard          extensions/sticky-cart
/app/settings        Sticky bar           blocks/sticky-cart.liquid  (app embed)
/app/free-shipping   Threshold + copy     assets/sticky-cart.js      (widget)
/app/analytics       Metrics              assets/sticky-cart.css

         Prisma (SQLite)                          App Proxy
   StickyCartSettings · ClickEvent  ◀──────▶  /apps/sticky-cart/settings (GET)
                                              /apps/sticky-cart/track    (POST)
```

- The admin app writes settings to **Prisma** (authoritative) and mirrors them
  into a **shop metaobject** for redundancy.
- The storefront widget loads live settings via the signed **App Proxy**
  (`/apps/sticky-cart/settings`) and posts interactions to
  `/apps/sticky-cart/track`. Both are HMAC-verified by
  `authenticate.public.appProxy`, so no storefront token is exposed.
- Theme-editor block settings act as a fallback if the proxy is unreachable.

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
cd apps/shopify-sticky-cart

# 1. Install deps
pnpm install

# 2. Create the Prisma SQLite DB (sessions + settings + analytics)
cp .env.example .env
pnpm prisma:generate
pnpm prisma:migrate   # creates dev.sqlite

# 3. Link to a Shopify app (creates one in your Partner account or links existing)
pnpm shopify app config link
# → choose "Create a new app" → name it "Klyna Sticky Cart"
# → the CLI rewrites shopify.app.toml with your real client_id

# 4. Copy the API key + secret from your Partner dashboard into .env
#    (Settings → Apps → Klyna Sticky Cart → API credentials)

# 5. Start the dev server (tunnels through Cloudflare Quick Tunnel)
pnpm dev
# → press 'p' to open the dev store with the app pre-installed
```

### Activate the storefront bar

Once the app is installed on your dev store:

1. Online Store → **Themes** → **Customize**
2. Open **App embeds** (the puzzle-piece icon in the left sidebar)
3. Toggle **Klyna Sticky Cart** on, then **Save**
4. Visit any product page — the bar appears as you scroll.

## Project layout

```
apps/shopify-sticky-cart/
├── shopify.app.toml              # Shopify app config — CLI rewrites client_id
├── shopify.web.toml              # Tells the Shopify CLI how to run the web role
├── vite.config.ts
├── prisma/schema.prisma          # Session + StickyCartSettings + ClickEvent
├── app/
│   ├── shopify.server.ts         # @shopify/shopify-app-remix init
│   ├── db.server.ts              # PrismaClient singleton
│   ├── root.tsx                  # HTML shell
│   ├── entry.server.tsx          # Remix SSR entry
│   ├── assets/logo.svg           # Product logo (Klyna mark + cart glyph)
│   ├── models/
│   │   ├── settings.server.ts    # Settings CRUD + metaobject mirror
│   │   └── analytics.server.ts   # Event recording + dashboard rollups
│   └── routes/
│       ├── _index/               # Public landing (when shop param is absent)
│       ├── auth.$.tsx            # OAuth callback (catch-all)
│       ├── auth.login.tsx        # Manual login form
│       ├── app.tsx              # Embedded app shell + NavMenu
│       ├── app._index.tsx       # Dashboard
│       ├── app.settings.tsx     # Sticky bar settings (loader/action → Prisma)
│       ├── app.free-shipping.tsx# Free-shipping threshold + copy
│       ├── app.analytics.tsx    # Analytics dashboard
│       ├── proxy.settings.tsx   # App Proxy: serve settings JSON to storefront
│       ├── proxy.track.tsx      # App Proxy: record storefront click events
│       └── webhooks.app.uninstalled.tsx
└── extensions/sticky-cart/       # Theme App Extension (storefront widget)
    ├── shopify.extension.toml
    ├── blocks/sticky-cart.liquid # App embed block (target: body)
    ├── assets/sticky-cart.js     # Bar logic, ATC/quick-buy, progress, analytics
    ├── assets/sticky-cart.css    # Mobile-first widget styles
    └── locales/en.default.json
```

## Scopes

| Scope               | Why                                                            |
| ------------------- | ------------------------------------------------------------- |
| `read_products`     | Load product/variant data for the bar + label analytics rows. |
| `read_metaobjects`  | Read the settings mirror.                                     |
| `write_metaobjects` | Upsert the settings mirror the storefront can read.          |

The storefront bar uses Shopify's standard, token-free AJAX cart endpoints
(`/cart/add.js`, `/cart.js`, `/checkout`).

## STATUS — honest

- ✅ **Embedded admin** (Dashboard, Sticky bar, Free shipping, Analytics) —
  real Polaris routes with loaders/actions that query the Admin GraphQL API and
  persist through Prisma.
- ✅ **Storefront widget** — complete Theme App Extension: scroll-reveal bar,
  variant + quantity, add-to-cart, quick-buy, free-shipping progress, analytics
  beacons. No stubs in the core path.
- ✅ **App Proxy** — settings + tracking endpoints, HMAC-verified.
- ✅ **Analytics** — events recorded from the storefront and rolled up into the
  dashboard (30/7/90-day windows, daily chart, top products).
- ⚠️ **Needs a Partner `client_id` + tunnel to run live.** OAuth cannot run
  without real app credentials. Run `pnpm shopify app config link` and fill in
  `.env`, then `pnpm dev`. Until then the code compiles but cannot authenticate.
- 🔜 **Not yet built:** A/B testing of CTA copy, cart-drawer integration beyond
  the generic `cart:refresh` event, billing (Shopify managed pricing).

## Deploy

```bash
pnpm shopify app deploy
```

The CLI bundles the app **and** the Theme App Extension, uploads to Shopify, and
creates a new version draft for App Store review.

## Architecture notes

- **Session + data storage** uses Prisma + SQLite locally. For production, swap
  `DATABASE_URL` to a Postgres URL (Supabase, Neon, Railway, Fly Postgres) and
  run `pnpm prisma:migrate`.
- **No paid APIs.** The bar runs on the storefront; analytics roll up locally on
  whatever Node host the app is deployed to. The Shopify Admin API is free.
- **Resilient by design.** Every storefront network call (settings, tracking,
  cart) fails soft — a flaky proxy never breaks add-to-cart, and a tracking
  failure never blocks a sale.
