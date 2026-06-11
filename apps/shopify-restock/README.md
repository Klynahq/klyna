# Klyna Back-in-Stock

**Restock alerts & waitlists that recover lost sold-out demand.**

When a variant sells out, the sale isn't gone — the *demand* is still there.
Klyna Back-in-Stock adds a “Notify me” button to every sold-out variant,
captures email &amp; SMS interest, and automatically alerts shoppers the moment
inventory returns. You get a ranked demand report so you know exactly what to
restock first.

Built on the official Shopify App Remix template (Remix + Polaris + App Bridge
+ Prisma), part of the [Klyna](https://klyna.dev) studio.

## Features

- **“Notify me” storefront button** — a Theme App Extension app block that
  renders *only* when the selected variant is sold out. No theme code, no
  liquid edits; merchants drop it into the product template from the theme
  editor. Follows variant selection client-side.
- **Email + SMS capture** — collect email (always) and phone (optional, for
  SMS). Optional marketing-consent checkbox for compliance.
- **Automatic restock alerts** — an `inventory_levels/update` webhook detects
  when a sold-out variant goes back above zero and flushes its waitlist. Sends
  are idempotent and resend-guarded so a flapping inventory feed can't spam.
- **Demand report** — sold-out variants ranked by how many shoppers are
  waiting, with the email/SMS split and live stock status. One click to
  re-check stock against the Admin API, one click to notify a variant manually.
- **Subscriber management** — browse, filter by status (waiting / notified /
  cancelled), remove or re-arm contacts, and export the whole list (or a
  filtered view) to CSV.
- **No paid APIs required to run** — without delivery keys the app runs in
  “log only” mode: every alert is still recorded so the pipeline behaves
  identically in development. Add Resend (email) / Twilio (SMS) keys to deliver.

## ⚠️ STATUS — what you need before running

This app is **fully built but not yet runnable on its own** because the OAuth
flow can't work without app credentials. Specifically you need:

1. A **Shopify Partner account** — free at <https://partners.shopify.com>
2. A **development store** — create one from the Partner dashboard
3. **Shopify CLI 3** — `pnpm add -g @shopify/cli@latest`
4. To run `shopify app config link` so the CLI writes a real `client_id` into
   `shopify.app.toml`, and to paste the API key + secret into `.env`
5. A **public tunnel** — `shopify app dev` provides one automatically (Cloudflare
   Quick Tunnel); the storefront widget and webhooks need a reachable URL.

Everything else — routes, services, webhooks, the Prisma schema, and the theme
extension — is complete and wired together. Delivery providers are optional
(see “log only” mode above).

## First-time setup

```bash
cd apps/shopify-restock

# 1. Install deps
pnpm install

# 2. Create the Prisma SQLite DB (sessions + waitlist storage)
cp .env.example .env
pnpm prisma:generate
pnpm prisma:migrate          # creates dev.sqlite

# 3. Link to a Shopify app (creates one in your Partner account or links existing)
pnpm shopify app config link
# → choose "Create a new app" → name it "Klyna Back-in-Stock"
# → the CLI rewrites shopify.app.toml with your real client_id

# 4. Copy the API key + secret from your Partner dashboard into .env
#    (Settings → Apps → Klyna Back-in-Stock → API credentials)

# 5. Start the dev server (tunnels through Cloudflare Quick Tunnel)
pnpm dev
# → press 'p' to open the dev store with the app pre-installed
```

Then, in the dev store theme editor, open a **product template**, **Add block →
Apps → Klyna Notify me**, and set its **App URL** to your tunnel URL (the value
of `application_url`). The block stays hidden until you view a sold-out variant.

## Project layout

```
apps/shopify-restock/
├── shopify.app.toml              # App config — CLI rewrites client_id; webhooks + scopes
├── shopify.web.toml              # Tells the Shopify CLI how to run the web role
├── vite.config.ts
├── prisma/schema.prisma          # Session + Subscription + Alert + VariantSnapshot + ShopSettings
├── app/
│   ├── shopify.server.ts         # @shopify/shopify-app-remix init
│   ├── db.server.ts              # PrismaClient singleton
│   ├── root.tsx / entry.server.tsx
│   ├── assets/logo.svg           # Product mark (bell glyph)
│   ├── services/
│   │   ├── waitlist.server.ts    # recordSignup + flushVariant (core domain logic)
│   │   ├── inventory.server.ts   # Admin GraphQL sync of variant snapshots
│   │   └── notifier.server.ts    # Resend (email) + Twilio (SMS) delivery
│   └── routes/
│       ├── _index/                 # Public landing (when shop param is absent)
│       ├── auth.$.tsx              # OAuth callback (catch-all)
│       ├── auth.login.tsx          # Manual login form
│       ├── api.subscribe.tsx       # Public CORS endpoint the widget POSTs to
│       ├── app.tsx                 # Embedded app shell + NavMenu
│       ├── app._index.tsx          # Dashboard (live KPIs + most-wanted)
│       ├── app.demand.tsx          # Demand report (ranked sold-out variants)
│       ├── app.subscribers.tsx     # Subscriber list, filter, remove, CSV export
│       ├── app.settings.tsx        # Widget copy + delivery settings
│       ├── webhooks.app.uninstalled.tsx
│       ├── webhooks.inventory.update.tsx   # Restock trigger → flush waitlist
│       └── webhooks.products.update.tsx    # Keep cached titles/handles fresh
└── extensions/notify-me/         # Theme App Extension — storefront "Notify me" widget
    ├── shopify.extension.toml
    ├── blocks/notify_me.liquid
    └── assets/{klyna-bis.css, klyna-bis.js}
```

## How the restock flow works

1. A shopper opens a product whose selected variant is **sold out**. The theme
   app block is visible; in-stock variants keep it hidden.
2. They enter their email (and optionally phone) and submit. The widget POSTs to
   **`/api/subscribe`**, which validates and writes a `Subscription` row
   (deduped per shop + variant + contact).
3. Later, the merchant restocks. Shopify fires **`inventory_levels/update`**.
   The webhook resolves the inventory item → variant via the Admin GraphQL API,
   refreshes the cached `VariantSnapshot`, and if the variant is now in stock
   calls **`flushVariant`**.
4. `flushVariant` creates an `Alert` per waiting subscriber, delivers it (Resend
   / Twilio, or logs in dev), marks the subscription **NOTIFIED**, and respects
   the per-shop **resend guard** so no one is alerted twice in the window.
5. The merchant watches it all in the **Demand report** and **Subscribers**
   screens, and can manually **Check stock now** (reconcile via the Admin API)
   or **Notify now** for any in-stock variant.

## Scopes & webhooks

- **Scopes:** `read_products`, `read_inventory`. Klyna never mutates your catalog
  (`write_products` is intentionally *not* requested).
- **Webhooks:** `app/uninstalled`, `inventory_levels/update`, `products/update`.

## Deploy

```bash
pnpm shopify app deploy
```

The CLI bundles the app + theme extension, uploads to Shopify, and creates a new
version draft for the App Store review process.

## Architecture notes

- **Session + waitlist storage** use Prisma + SQLite locally. For production,
  point `DATABASE_URL` at Postgres (Supabase, Neon, Railway, Fly) and
  `pnpm prisma:migrate`.
- **Delivery is pluggable.** `app/services/notifier.server.ts` ships Resend and
  Twilio implementations behind a single `deliver()` function — swap in
  Postmark / SendGrid / MessageBird by editing one file.
- **Snapshots over re-queries.** The dashboard, demand report, and widget read a
  denormalized `VariantSnapshot` cache instead of hitting the Admin API on every
  render; webhooks keep it fresh.
- **No paid APIs in the default stack.** The Shopify Admin API is free; email/SMS
  providers are opt-in.
