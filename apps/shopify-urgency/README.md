# Klyna Urgency

Countdown timers, low-stock scarcity & live social-proof popups for Shopify —
lightweight, theme-native, and free to start. Built on the official Shopify App
Remix template (Remix + App Bridge + Polaris + Prisma) and the Klyna brand
system.

> Part of the Klyna studio. _Tools that help your work get found._

## What it does

- **Scheduled countdown timers** — sale, launch, and per-visitor evergreen
  countdowns. Choose what happens at zero: hide, hold at `00:00:00`, or swap to a
  message.
- **Stock scarcity badges** — "Only N left!" wired to your **real** Shopify
  inventory. Per-product or store-wide thresholds, with a floor so you never show
  an alarming "Only 1 left" unless you want to.
- **Recently-purchased social proof** — a rotating popup built from your synced
  orders. Privacy-safe: every order is reduced to a **first name + city** before
  anything is stored or shown.
- **Targeting rules** — show timers by page (home / product / collection / cart)
  and device (desktop / mobile).
- **Theme app extension** — three drop-in blocks (Countdown, Scarcity, Social
  Proof) that render natively in any Online Store 2.0 theme. No theme code edits.
- **Impression analytics** — views, clicks, CTR, and attributed conversions roll
  up daily per widget, viewable on the dashboard and the Analytics page.

## ⚠️ Status — what you need before running

This app is **fully authored** but needs Shopify Partner credentials and a tunnel
to run live — OAuth and the app proxy can't work without them.

1. **Shopify Partner account** — free at <https://partners.shopify.com>
2. **A development store** — create one from the Partner dashboard
3. **Shopify CLI 3** — install once globally:
   ```bash
   pnpm add -g @shopify/cli@latest
   ```

Everything else (routes, GraphQL queries, Prisma models, the storefront runtime,
and the three theme blocks) is complete and ready to run once credentials are in
place. No code is stubbed.

## First-time setup

```bash
cd apps/shopify-urgency

# 1. Install deps
pnpm install

# 2. Create the Prisma SQLite DB (session storage + widget data)
cp .env.example .env
pnpm prisma:generate
pnpm prisma:migrate   # creates dev.sqlite

# 3. Link to a Shopify app (creates one in your Partner account or links existing)
pnpm shopify app config link
# → choose "Create a new app" → name it "Klyna Urgency"
# → the CLI rewrites shopify.app.toml with your real client_id

# 4. Copy the API key + secret from your Partner dashboard into .env
#    (Settings → Apps → Klyna Urgency → API credentials)

# 5. Start the dev server (tunnels through Cloudflare Quick Tunnel)
pnpm dev
# → press 'p' to open the dev store with the app pre-installed
```

### Configure the App Proxy (required for the storefront blocks)

The theme blocks fetch live config and report impressions through Shopify's App
Proxy. In your Partner dashboard:

**App setup → App proxy**
- **Subpath prefix:** `apps`
- **Subpath:** `klyna-urgency`
- **Proxy URL:** `https://<your-tunnel-or-app-url>/app/api`

That maps:
- `/apps/klyna-urgency/app/api/config` → `app/routes/app.api.config.tsx`
- `/apps/klyna-urgency/app/api/event`  → `app/routes/app.api.event.tsx`

Both routes verify the proxy signature via `authenticate.public.appProxy`.

### Add the blocks to your theme

1. In the dev store, open **Online Store → Themes → Customize**.
2. **Add block → Apps →** search "Klyna Urgency".
3. Drop **Klyna Countdown** / **Klyna Scarcity** onto a section, and add **Klyna
   Social Proof** as an app embed (footer/body).
4. Configure rules on the app dashboard — changes go live immediately.

## Project layout

```
apps/shopify-urgency/
├── shopify.app.toml             # App config — CLI rewrites client_id
├── shopify.web.toml             # Tells the Shopify CLI how to run the web role
├── vite.config.ts
├── prisma/schema.prisma         # Session storage + urgency widget models
├── app/
│   ├── shopify.server.ts        # @shopify/shopify-app-remix init
│   ├── db.server.ts             # PrismaClient singleton
│   ├── root.tsx                 # HTML shell (favicon = product logo)
│   ├── entry.server.tsx         # Remix SSR entry
│   ├── assets/logo.svg          # Product logo (clock glyph in the Klyna mark)
│   ├── lib/analytics.server.ts  # Impression aggregation helpers
│   └── routes/
│       ├── _index/                # Public landing (when shop param is absent)
│       ├── auth.$.tsx             # OAuth callback (catch-all)
│       ├── auth.login.tsx         # Manual login form
│       ├── app.tsx                # Embedded app shell + NavMenu
│       ├── app._index.tsx         # Dashboard
│       ├── app.timers.tsx         # Countdown timers (CRUD + targeting)
│       ├── app.scarcity.tsx       # Stock scarcity (Admin GraphQL inventory)
│       ├── app.social-proof.tsx   # Social proof (order sync + config)
│       ├── app.analytics.tsx      # Impression analytics
│       ├── app.api.config.tsx     # Public: widget config (app proxy)
│       ├── app.api.event.tsx      # Public: impression beacon (app proxy)
│       └── webhooks.app.uninstalled.tsx
└── extensions/klyna-urgency/    # Theme app extension
    ├── shopify.extension.toml
    ├── blocks/{countdown,scarcity,social-proof}.liquid
    └── assets/{klyna-urgency.js, klyna-urgency.css}
```

## How the data flows

- **Admin (Polaris) routes** read/write widget config and rules via Prisma, and
  query the **Shopify Admin GraphQL API** (`authenticate.admin`) for products,
  inventory, and recent orders.
- **Storefront blocks** load `klyna-urgency.js`, which fetches `/app/api/config`
  through the app proxy once per page, renders any blocks present, and beacons
  `view`/`click`/`conversion` events to `/app/api/event`.
- **Analytics** are aggregated into one `Impression` row per widget per day, so
  the table stays tiny regardless of traffic.

## Privacy

Social proof never stores or displays full names, emails, or addresses. On
**Sync recent orders**, each paid order is reduced server-side to
`{ firstName, city, productTitle }` and an order GID (for de-duplication). That
is the only customer data this app persists.

## Deploy

```bash
pnpm shopify app deploy
```

The CLI bundles the app + theme extension, uploads to Shopify, and creates a new
version draft for App Store review.

## Architecture notes

- **Session + widget storage** use Prisma + SQLite locally. For production, point
  `DATABASE_URL` at Postgres (Supabase, Neon, Railway, Fly) and
  `pnpm prisma:migrate`.
- **No paid APIs.** Inventory, orders, and products all come from the free
  Shopify Admin API. The storefront runtime is dependency-free vanilla JS.
- **Scopes:** `read_products`, `read_inventory`, `read_orders`, `read_themes` —
  kept in sync between `shopify.app.toml` and `.env`.
```
