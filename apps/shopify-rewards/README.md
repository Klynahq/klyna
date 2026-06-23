# Klyna Rewards

Loyalty points, tiers & referrals that bring customers back. Members earn
points for orders, signups, reviews, and referrals, then redeem them for real
Shopify discount codes — with a customer-facing storefront widget and a full
admin to configure it all. Built on the official Shopify App Remix template
with Polaris + App Bridge.

> Part of the [Klyna](https://klyna.dev) studio — _tools that help your work
> get found._

## What it does

- **Earn points** — automatically on paid orders (configurable points per
  currency unit), on account signup, on referrals, and a manual award/deduct
  control for reviews or goodwill. All earning runs off Shopify webhooks
  (`orders/paid`, `customers/create`).
- **Redeem for discounts** — turn a member's points into a real fixed-amount
  Shopify discount code via the Admin GraphQL API (`discountCodeBasicCreate`),
  one click from the member list. Points are burned in the same transaction.
- **Tiers** — Bronze → Silver → Gold out of the box, fully editable. Each tier
  has a lifetime-points threshold, an earn multiplier, and a perk. Order points
  are multiplied by the member's current tier.
- **Referrals** — every member gets a unique referral code. When a referred
  friend places their first paid order (the storefront stamps the advocate's
  code onto the order as a note attribute), the advocate is rewarded
  automatically. Merchants can also log/convert referrals by hand.
- **Storefront widget** — a Theme App Extension block merchants drop into any
  section. It shows the shopper's balance, tier progress, redeemable rewards,
  and a copyable referral link, all themed to match the store.

## ⚠️ STATUS

This app is **fully implemented but not yet runnable live** — it needs Shopify
Partner credentials and a tunnel to complete OAuth. Everything else is real:

- ✅ Admin UI (dashboard, members, tiers, referrals, settings) — real loaders
  and actions backed by Prisma.
- ✅ Earning, redemption, tiering, and referral logic — real, in
  `app/rewards.server.ts`; no stubbed core logic.
- ✅ Admin GraphQL calls — customer sync and discount-code creation.
- ✅ Webhooks — `orders/paid`, `customers/create`, `app/uninstalled`.
- ✅ App-proxy endpoint + Theme App Extension storefront widget.
- ⛔️ **Needs you:** a Partner `client_id` (via `shopify app config link`),
  `SHOPIFY_API_KEY` / `SHOPIFY_API_SECRET` in `.env`, and a dev store. Until
  those exist the OAuth handshake can't run, so the app can't be installed.

## What you need before running

1. **Shopify Partner account** — free at <https://partners.shopify.com>
2. **A development store** — create one from the Partner dashboard
3. **Shopify CLI 3** — install once globally:
   ```bash
   pnpm add -g @shopify/cli@latest
   ```

## First-time setup

```bash
cd apps/shopify-rewards

# 1. Install deps
pnpm install

# 2. Create the Prisma SQLite DB for session + program storage
cp .env.example .env
pnpm prisma:generate
pnpm prisma:migrate   # applies the Postgres schema

# 3. Link to a Shopify app (creates one in your Partner account or links to existing)
pnpm shopify app config link
# → choose "Create a new app" → name it "Klyna Rewards"
# → the CLI rewrites shopify.app.toml with your real client_id

# 4. Copy the API key + secret from your Partner dashboard into .env
#    (Settings → Apps → Klyna Rewards → API credentials)

# 5. Start the dev server (tunnels through Cloudflare Quick Tunnel)
pnpm dev
# → press 'p' to open the dev store with the app pre-installed
```

Then, in the dev store theme editor (Online Store → Customize → Add block →
Apps → **Klyna Rewards**), drop the storefront widget onto a section — the
account page is a great spot.

## Project layout

```
apps/shopify-rewards/
├── shopify.app.toml             # App config — CLI rewrites client_id; scopes,
│                                #   webhooks, and the /apps/rewards app proxy
├── shopify.web.toml             # Tells the Shopify CLI how to run the web role
├── vite.config.ts
├── prisma/schema.prisma         # Session + Program + Tier + Member + ledger
├── app/
│   ├── shopify.server.ts        # @shopify/shopify-app-remix init
│   ├── db.server.ts             # PrismaClient singleton
│   ├── rewards.server.ts        # Domain logic: points, tiers, members, ledger
│   ├── root.tsx                 # HTML shell (favicon = product logo)
│   ├── entry.server.tsx         # Remix SSR entry
│   ├── assets/logo.svg          # Klyna Rewards mark (star medal glyph)
│   └── routes/
│       ├── _index/                  # Public landing (when shop param is absent)
│       ├── auth.$.tsx               # OAuth callback (catch-all)
│       ├── auth.login.tsx           # Manual login form
│       ├── app.tsx                  # Embedded app shell + NavMenu
│       ├── app._index.tsx           # Dashboard with live program stats
│       ├── app.members.tsx          # Member list, sync, award/redeem
│       ├── app.tiers.tsx            # Tier CRUD
│       ├── app.referrals.tsx        # Referral tracking + conversion
│       ├── app.settings.tsx         # Program configuration
│       ├── widget.state.tsx         # App-proxy JSON endpoint for the widget
│       ├── webhooks.orders.paid.tsx       # Earn order points + convert referral
│       ├── webhooks.customers.create.tsx  # Enroll member + signup bonus
│       └── webhooks.app.uninstalled.tsx
└── extensions/rewards-widget/   # Theme App Extension (storefront widget)
    ├── shopify.extension.toml
    ├── blocks/rewards.liquid
    ├── assets/{rewards.css,rewards.js}
    └── locales/en.default.json
```

## How the data flows

1. A shopper signs up → `customers/create` webhook → `upsertMember` + signup
   bonus written to the `PointsEvent` ledger.
2. They place a paid order → `orders/paid` webhook → order points computed from
   `pointsPerDollar × tier multiplier`, balance and lifetime updated, tier
   re-resolved.
3. The storefront widget fetches `/apps/rewards/widget/state` (signed app
   proxy) → returns the member's balance, tier progress, and referral code.
4. A friend orders with `?ref=CODE` (stamped onto the order as a note
   attribute) → the advocate earns referral points automatically.
5. The merchant clicks **Create code** on a member → a real Shopify discount
   code is created and the member's points are burned.

## Architecture notes

- **Session + program storage** uses Prisma + SQLite locally. For production,
  point `DATABASE_URL` at Postgres (Supabase, Neon, Railway, Fly Postgres) and
  run `pnpm prisma:migrate`.
- **The ledger is the source of truth.** Every earn/redeem/adjust writes an
  append-only `PointsEvent`; `Member.balance` and `Member.lifetime` are the
  running totals, updated transactionally so a balance can never drift from its
  history.
- **Lifetime only grows.** Redemptions reduce spendable `balance` but never the
  `lifetime` total used for tier placement, so a member never gets demoted for
  spending their points.
- **No paid APIs.** The Shopify Admin API is free; everything else runs on
  whatever Node host the app is deployed to.

## Deploy

```bash
pnpm shopify app deploy
```

The CLI bundles the app + the theme extension, uploads to Shopify, and creates
a new version draft for the App Store review process.
