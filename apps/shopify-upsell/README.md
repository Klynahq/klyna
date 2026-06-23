# Klyna Upsell

Post-purchase and in-cart upsells and cross-sells that raise revenue per order.
Built on the official Shopify App Remix template — Remix + App Bridge + Polaris +
Prisma — with a rules engine, A/B testing, and conversion analytics.

> Part of the Klyna studio. _Tools that help your work get found._

## What it does

- **Offer rules engine.** Create offers that trigger when a specific **product**
  is in the cart, when any product from a **collection** is in the cart, or when
  the **cart subtotal** crosses a threshold. Each offer recommends a product and
  can carry a discount + custom copy.
- **In-cart upsell widget.** A theme app extension renders the best-matching
  offer right in the cart drawer / cart page. No theme code — merchants add the
  “Klyna Upsell” block from the theme editor. One click adds the product via the
  Shopify AJAX Cart API.
- **Post-purchase offer.** A Checkout UI extension scaffold shows a one-click
  upsell on the thank-you page, charging the existing payment method with no
  re-entry.
- **A/B testing.** Give an offer two recommendations (variant A and B) and a
  traffic split. Klyna buckets shoppers deterministically by cart token, then
  reports a winner once both arms have a meaningful sample.
- **Conversion analytics.** Every impression, accept, and decline is logged.
  Accepts are reconciled against the `orders/create` webhook to attribute real
  revenue. The dashboard shows accept rate, confirmed conversions, and revenue
  per offer and per variant.

## ⚠️ STATUS — what you need before running

This app is **fully authored but not yet run live**. It needs two things only a
merchant/partner can provide:

1. A **Shopify Partner account** (free at <https://partners.shopify.com>) — the
   embedded OAuth flow cannot work without an app `client_id` + secret.
2. A **public tunnel** — `shopify app dev` provisions a Cloudflare Quick Tunnel
   automatically; the storefront widget and post-purchase extension fetch
   `/api/offers` over that URL.

Everything else — the rules engine, the Admin GraphQL queries, the Prisma
models, the storefront API, the theme extension, and the analytics math — is
real and implemented. The post-purchase extension is a working scaffold; the
`applyChangeset` call should be server-signed before production (see notes
below). No mock data, no stubbed core logic.

## First-time setup

```bash
cd apps/shopify-upsell

# 1. Install deps (from the monorepo root: pnpm install)
pnpm install

# 2. Create the Prisma SQLite DB for session + offer storage
cp .env.example .env
pnpm prisma:generate
pnpm prisma:migrate          # applies the Postgres schema

# 3. Link to a Shopify app (creates one in your Partner account or links existing)
pnpm shopify app config link
# → choose "Create a new app" → name it "Klyna Upsell"
# → the CLI rewrites shopify.app.toml with your real client_id

# 4. Copy the API key + secret from your Partner dashboard into .env
#    (Settings → Apps → Klyna Upsell → API credentials)

# 5. Start the dev server (tunnels through Cloudflare Quick Tunnel)
pnpm dev
# → press 'p' to open the dev store with the app pre-installed
```

Then, in the dev store:

- **Cart widget:** Online Store → Themes → Customize → add the **Klyna Upsell**
  app block to your cart drawer / cart template, then Save.
- **Post-purchase:** Settings → Checkout → Post-purchase page → select
  **Klyna Upsell**.

## Project layout

```
apps/shopify-upsell/
├── shopify.app.toml              # App config — CLI rewrites client_id
├── shopify.web.toml              # How the Shopify CLI runs the web role
├── vite.config.ts
├── prisma/schema.prisma          # Session + Offer + OfferVariant + OfferEvent
├── app/
│   ├── shopify.server.ts         # @shopify/shopify-app-remix init
│   ├── db.server.ts              # PrismaClient singleton
│   ├── root.tsx / entry.server.tsx
│   ├── models/
│   │   ├── offers.server.ts      # Rules engine, A/B bucketing, analytics rollup, save
│   │   └── admin.server.ts       # Admin GraphQL product/collection helpers
│   ├── components/OfferEditor.tsx
│   └── routes/
│       ├── _index/               # Public landing (shop param absent)
│       ├── auth.$.tsx / auth.login.tsx
│       ├── app.tsx               # Embedded shell + NavMenu
│       ├── app._index.tsx        # Dashboard with live KPIs
│       ├── app.offers._index.tsx # Offers list (toggle / delete)
│       ├── app.offers.new.tsx    # Create offer
│       ├── app.offers.$id.tsx    # Edit offer
│       ├── app.analytics.tsx     # Conversion + A/B dashboard
│       ├── app.settings.tsx      # Widget + post-purchase activation
│       ├── api.offers.tsx        # Storefront-facing offer + event endpoint
│       ├── webhooks.app.uninstalled.tsx
│       └── webhooks.orders.create.tsx   # Revenue attribution
└── extensions/
    ├── cart-upsell/              # Theme app extension (in-cart widget)
    │   ├── shopify.extension.toml
    │   ├── blocks/cart-upsell.liquid
    │   └── assets/{cart-upsell.js, cart-upsell.css}
    └── post-purchase/            # Checkout UI extension scaffold
        ├── shopify.extension.toml
        └── src/index.tsx
```

## How it fits together

1. The **theme block** reads the live cart (product GIDs, collection GIDs,
   subtotal, cart token) and calls `GET /api/offers`.
2. `api.offers.tsx` runs the **rules engine** (`triggerMatches`), picks the A/B
   variant deterministically (`pickVariant`), logs an **impression**, and
   returns the offer.
3. On accept, the widget adds the product via `/cart/add.js` and posts an
   **accept** event. On the thank-you page, the post-purchase extension does the
   equivalent via `applyChangeset`.
4. When the order is placed, **`orders/create`** reconciles recent accepts whose
   product appears in the order, stamping them with the order GID + line revenue.
5. **`app.analytics.tsx`** folds the event log into per-offer / per-variant
   rollups and calls the A/B winner.

## Data model

- `Offer` — name, enabled, `triggerType` (`product` | `collection` |
  `cart_value`), `triggerValue`, `placement` (`cart` | `post_purchase`),
  `splitA`.
- `OfferVariant` — `A` / `B`, the recommended product snapshot, copy, and
  `discountPercent`.
- `OfferEvent` — append-only `impression` / `accept` / `decline`, with `revenue`
  and `orderGid` set on confirmed conversions.

## Deploy

```bash
pnpm shopify app deploy
```

The CLI bundles the app + extensions, uploads to Shopify, and creates a version
draft for App Store review.

## Architecture notes

- **Session + app data** use Prisma + SQLite locally. For production, point
  `DATABASE_URL` at Postgres (Supabase / Neon / Railway / Fly) and re-run
  `pnpm prisma:migrate`.
- **The storefront endpoint** (`/api/offers`) is intentionally unauthenticated
  and CORS-enabled — it only ever returns offers the merchant configured and
  only writes append-only event rows. It validates the `shop` against an
  installed session before serving or accepting writes. For hardening, move it
  behind a Shopify **App Proxy** so requests carry an HMAC signature.
- **Post-purchase `applyChangeset`** must be signed server-side before
  production. Add a tiny `/api/postpurchase/sign` route that signs the changeset
  with your API secret and have the extension call `applyChangeset(token, {
  changes, signedChangeset })`. The scaffold applies it directly for preview.
- **No paid APIs.** Everything runs on the Node host the app is deployed to plus
  the free Shopify Admin API.
```
