# Klyna Wishlist

**Wishlists, guest saves & shareable lists that re-engage shoppers.**

Let visitors save the products they love — logged in or as guests — then bring
them back with shareable lists and most-wishlisted insight. Built on the
official Shopify App Remix template with Polaris, App Bridge, and a Theme App
Extension for the storefront widget. No paid APIs.

## Features

- **Add-to-wishlist on product & collection pages** — a clean heart button
  shipped as a Theme App Extension. No theme code to edit; add it from the
  theme editor.
- **Guest saves** — visitors save instantly to `localStorage` with zero
  latency, no account required. Saves sync to the server on the next request.
- **Logged-in saves** — when a shopper is signed in, their wishlist attaches to
  the Shopify customer and follows them across devices.
- **Customer wishlist page** — a full storefront wishlist rendered through the
  Shopify App Proxy at `/apps/wishlist`, themed by the store's own layout.
- **Shareable wishlist links** — opt-in per list. Enable a link in the admin
  and anyone with the URL can view (not edit) the list at
  `/apps/wishlist?list=<token>`.
- **Analytics & most-wishlisted report** — live dashboard metrics (wishlists,
  items saved, 30-day saves/shares, save→cart conversion) plus a ranked
  most-wishlisted table you can refresh from the live catalog.

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
cd apps/shopify-wishlist

# 1. Install deps
pnpm install

# 2. Create the Prisma SQLite DB for sessions + wishlist data
cp .env.example .env
pnpm prisma:generate
pnpm prisma:migrate   # applies the Postgres schema

# 3. Link to a Shopify app (creates one in your Partner account or links existing)
pnpm shopify app config link
# → choose "Create a new app" → name it "Klyna Wishlist"
# → the CLI rewrites shopify.app.toml with your real client_id

# 4. Copy the API key + secret from your Partner dashboard into .env
#    (Settings → Apps → Klyna Wishlist → API credentials)

# 5. Start the dev server (tunnels through Cloudflare Quick Tunnel)
pnpm dev
# → press 'p' to open the dev store with the app pre-installed
```

Then in the store's **theme editor**: add the **Wishlist button** block to a
product template, and enable the **Klyna Wishlist** app embed under
*Theme settings → App embeds*. Settings → "Add the wishlist button" in the app
walks you through it.

## Project layout

```
apps/shopify-wishlist/
├── shopify.app.toml              # Shopify app config — CLI rewrites client_id
├── shopify.web.toml              # Tells the Shopify CLI how to run the web role
├── vite.config.ts
├── prisma/schema.prisma          # Sessions + Wishlist / WishlistItem / WishlistEvent
├── app/
│   ├── shopify.server.ts         # @shopify/shopify-app-remix init
│   ├── db.server.ts              # PrismaClient singleton
│   ├── wishlist.server.ts        # Shared wishlist queries + Admin GraphQL hydration
│   ├── root.tsx                  # HTML shell
│   ├── entry.server.tsx          # Remix SSR entry
│   ├── assets/logo.svg           # Product logo (heart glyph in the Klyna mark)
│   └── routes/
│       ├── _index/                 # Public landing (when shop param is absent)
│       ├── auth.$.tsx              # OAuth callback (catch-all)
│       ├── auth.login.tsx          # Manual login form
│       ├── app.tsx                 # Embedded app shell + NavMenu
│       ├── app._index.tsx          # Dashboard (live metrics + top saved)
│       ├── app.lists.tsx           # Browse wishlists, toggle share links, delete
│       ├── app.reports.tsx         # Most-wishlisted report (refresh from catalog)
│       ├── app.settings.tsx        # Install guide + storefront URLs
│       ├── proxy._index.tsx        # Storefront wishlist + shared-list page (liquid)
│       ├── proxy.api.tsx           # Storefront JSON API (save/remove/merge/list)
│       └── webhooks.app.uninstalled.tsx
├── extensions/
│   └── wishlist-button/          # Theme App Extension (storefront widget)
│       ├── shopify.extension.toml
│       ├── blocks/wishlist-button.liquid   # Heart button (product/collection)
│       ├── blocks/wishlist-embed.liquid    # App embed: floating launcher + boot
│       └── assets/{wishlist.js, wishlist.css}
└── public/favicon.svg            # Product logo as favicon
```

## How the data flows

1. A shopper taps the heart on a product. `wishlist.js` updates `localStorage`
   immediately (optimistic UI) and `POST`s to the App Proxy `/apps/wishlist/api`.
2. The proxy route (`proxy.api.tsx`) verifies Shopify's signed request via
   `authenticate.public.appProxy`, resolves the product through the Admin
   GraphQL API, and upserts a `WishlistItem` (plus a `WishlistEvent` for
   analytics).
3. The admin dashboard and **Most wishlisted** report aggregate
   `WishlistItem` / `WishlistEvent` rows with Prisma `groupBy` — no extra
   tracking service, no paid analytics.
4. Shareable links are opt-in: toggling a list public in `app.lists.tsx` lets
   `proxy._index.tsx` render it read-only at `/apps/wishlist?list=<token>`.

## Scopes

`read_products` (resolve titles/images/prices for items and reports) and
`read_customers` (link logged-in saves to a customer). The storefront pages are
served through the App Proxy declared in `shopify.app.toml` under `[app_proxy]`.

## STATUS

**Scaffolded and feature-complete in code — needs your Partner credentials and a
tunnel to run live.**

- ✅ OAuth + embedded admin (works out of the box once credentials are in place)
- ✅ Prisma models for wishlists, items, and analytics events
- ✅ Storefront Theme App Extension: heart button + floating launcher + engine
- ✅ App Proxy JSON API: add / remove / merge / list with Admin GraphQL hydration
- ✅ Storefront wishlist page + read-only shareable lists (liquid-wrapped)
- ✅ Admin: live dashboard, browse-wishlists, most-wishlisted report, settings
- ⏳ **Requires** a Shopify Partner `client_id` (via `shopify app config link`)
  and a public tunnel (`shopify app dev` provides one) before OAuth or the App
  Proxy can resolve — these cannot be exercised without a real dev store.
- 🔜 Not yet built: email re-engagement ("price dropped on your saved item"),
  back-in-stock alerts, billing (Shopify managed pricing), bulk export of
  most-wishlisted to CSV.

## Deploy

```bash
pnpm shopify app deploy
```

The CLI bundles the app + the Theme App Extension, uploads to Shopify, and
creates a new version draft for the App Store review process.

## Architecture notes

- **Session + wishlist storage** uses Prisma + SQLite locally. For production,
  point `DATABASE_URL` at Postgres (Supabase, Neon, Railway, Fly Postgres — any
  work) and `pnpm prisma:migrate`.
- **No paid APIs** — every save, report, and aggregation runs on your app host
  against Shopify's free Admin + App Proxy surfaces.
- **Guest-first** — the heart works before login. The localStorage cache and a
  one-time server merge mean a guest who later signs in keeps every save.
