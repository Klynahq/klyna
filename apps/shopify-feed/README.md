# Klyna Feed

**Product feeds for Google, Meta, TikTok & Pinterest — always in sync.**

Klyna Feed turns your Shopify catalog into clean, channel-ready product feeds and
keeps them current. One catalog, four channels: Google Shopping XML and Meta /
TikTok / Pinterest CSV, all driven by the same field and taxonomy mapping with
per-channel include rules, metafield overrides, scheduled refresh, and a health
report that flags missing fields before the channel rejects them.

Built on the official Shopify App Remix template (Remix + App Bridge + Polaris),
matching the Klyna house style.

---

## Features

- **Multi-channel feeds** — Google Shopping (RSS 2.0 XML) plus Meta, TikTok, and
  Pinterest (CSV). The renderers share one internal field vocabulary, so a single
  mapping drives every channel.
- **Field mapping** — map each feed field (`title`, `gtin`, `brand`, `color`, …) to
  a product attribute, a metafield, or a literal fallback. Metafield wins over
  attribute, attribute wins over fallback.
- **Taxonomy mapping** — assign Google product category ids per collection, with a
  shop-wide default for everything else.
- **Metafield overrides** — point any field at `klyna_feed.<key>` (namespace
  configurable in Settings) to override values per product without touching the
  default mapping.
- **Include / exclude rules** — filter by product status, Online Store publish
  state, image/price presence, specific collections, excluded tags, and a price
  window. Each excluded item is counted in the run summary.
- **Scheduled refresh** — rebuild every hour / 6h / 12h / daily, plus instant
  invalidation on `products/update` and `products/delete` webhooks.
- **Feed health report** — scores each feed 0–100 (A–F), grouping issues like
  "23 items missing `brand`" with sample ids and direct links to fix the mapping.
- **Fast public delivery** — each feed has an unguessable token URL
  (`/feeds/<token>.xml|.csv`) that serves the latest generated snapshot from
  storage — no live Admin query on the crawler path.
- **Theme app extension** — an optional "Also available on" product block plus
  Product JSON-LD that mirrors the feed mapping, so on-page structured data and the
  syndicated feed stay consistent.

---

## ⚠️ STATUS

This app is **fully built and structurally ready to run, but not yet live**. To
run it against a real store you need two things this repo cannot include:

1. **A Shopify Partner app** — `client_id` in `shopify.app.toml` is a placeholder.
   Run `shopify app config link` to create/bind a real app and rewrite it, then put
   the API key + secret in `.env`.
2. **A public tunnel** — the embedded OAuth flow needs a public HTTPS URL. The
   Shopify CLI provides one automatically via `shopify app dev`.

Everything else — OAuth wiring, the Admin GraphQL queries, feed generation
(XML + CSV), mapping, rules, health scoring, persistence, scheduled refresh, public
delivery, and the theme extension — is implemented, not stubbed. Once credentials
and a tunnel are in place it runs end to end.

`@klyna/core` is **not** a dependency here: Klyna Feed ships its own feed engine
under `app/lib/`, so the app is self-contained and installs standalone.

---

## What you need before running

1. **Shopify Partner account** — free at <https://partners.shopify.com>
2. **A development store** — create one from the Partner dashboard
3. **Shopify CLI 3** — install once globally:
   ```bash
   pnpm add -g @shopify/cli@latest
   ```

## First-time setup

```bash
cd apps/shopify-feed

# 1. Install deps
pnpm install

# 2. Create the Prisma SQLite DB (sessions + feeds)
cp .env.example .env
pnpm prisma:generate
pnpm prisma:migrate   # applies the Postgres schema

# 3. Link to a Shopify app (creates one in your Partner account or links existing)
pnpm shopify app config link
# → choose "Create a new app" → name it "Klyna Feed"
# → the CLI rewrites shopify.app.toml with your real client_id

# 4. Copy the API key + secret from your Partner dashboard into .env
#    (Settings → Apps → Klyna Feed → API credentials)

# 5. Start the dev server (tunnels through Cloudflare Quick Tunnel)
pnpm dev
# → press 'p' to open the dev store with the app pre-installed
```

## Project layout

```
apps/shopify-feed/
├── shopify.app.toml            # Shopify app config — CLI rewrites client_id
├── shopify.web.toml            # Tells the Shopify CLI how to run the web role
├── vite.config.ts
├── prisma/schema.prisma        # Session + Feed + FeedRun + ShopSettings
├── app/
│   ├── shopify.server.ts       # @shopify/shopify-app-remix init
│   ├── db.server.ts            # PrismaClient singleton
│   ├── root.tsx                # HTML shell (favicon = product logo)
│   ├── entry.server.tsx        # Remix SSR entry
│   ├── assets/logo.svg         # Klyna Feed mark
│   ├── lib/                    # The feed engine (pure + server)
│   │   ├── types.ts            # Domain types
│   │   ├── channels.ts         # Channel defs, defaults, field order/labels
│   │   ├── products.server.ts  # Admin GraphQL fetch → flattened ProductViews
│   │   ├── mapping.ts          # Field/taxonomy resolution + include rules
│   │   ├── render.ts           # Google XML + channel CSV renderers
│   │   ├── health.ts           # Health scoring + grouped issues
│   │   ├── serialize.ts        # Prisma row ↔ FeedConfig
│   │   └── feeds.server.ts     # generateFeed() orchestration + cron worker
│   └── routes/
│       ├── _index/               # Public landing (when shop param absent)
│       ├── auth.$.tsx            # OAuth callback (catch-all)
│       ├── auth.login.tsx        # Manual login form
│       ├── app.tsx               # Embedded app shell + NavMenu
│       ├── app._index.tsx        # Dashboard
│       ├── app.feeds._index.tsx  # Feed list
│       ├── app.feeds.new.tsx     # Create a feed
│       ├── app.feeds.$id.tsx     # Feed editor: mapping, taxonomy, rules, schedule
│       ├── app.health.tsx        # Feed health report
│       ├── app.settings.tsx      # Metafield namespace, default category, pause
│       ├── feeds.$file.tsx       # Public token delivery (/feeds/<token>.xml|.csv)
│       ├── cron.refresh.tsx      # Scheduled-refresh worker (CRON_SECRET-gated)
│       ├── webhooks.app.uninstalled.tsx
│       ├── webhooks.products.update.tsx
│       └── webhooks.products.delete.tsx
└── extensions/
    └── klyna-feed-badge/         # Theme app extension: "Also available on" + JSON-LD
```

## How it works

1. **Configure** a feed (channel, currency, language, refresh interval).
2. **Map** fields and taxonomy, set include/exclude rules. Saved to SQLite as
   JSON on the `Feed` row.
3. **Generate** — `generateFeed()` pages the whole catalog via Admin GraphQL,
   flattens products to per-variant items, applies rules, resolves every field,
   renders XML or CSV, scores health, and stores a `FeedRun` snapshot.
4. **Deliver** — channels poll `/feeds/<token>.xml|.csv`, which serves the latest
   snapshot from storage (fast, cacheable, no Admin call).
5. **Refresh** — a hosted cron hits `/cron/refresh?key=$CRON_SECRET` every few
   minutes to rebuild due feeds; product webhooks mark feeds due immediately.

### Wiring the scheduled refresh

`cron.refresh` does the work; you just need something to call it. Any scheduler
works — Vercel Cron, GitHub Actions, Fly machines, a system crontab:

```
*/15 * * * *  curl -fsS "https://your-app-url/cron/refresh?key=$CRON_SECRET"
```

`CRON_SECRET` defaults to `FEED_TOKEN_SALT` if unset, so a fresh install still has
a non-empty secret. The worker uses offline admin sessions, so it runs without an
interactive login.

## Deploy

```bash
pnpm shopify app deploy
```

The CLI bundles the app + theme extension, uploads to Shopify, and creates a new
version draft for App Store review.

## Architecture notes

- **Session + data storage** use Prisma + SQLite locally. For production, point
  `DATABASE_URL` at Postgres (Supabase, Neon, Railway, Fly) and `pnpm prisma:migrate`.
- **Snapshots, not live queries** — feed bodies are persisted on each run so the
  public URL is fast and stable; we keep the latest 20 runs per feed.
- **No paid APIs** — generation runs locally on the app host; the Shopify Admin API
  is free. In keeping with the Klyna premise, "free where it can be".
