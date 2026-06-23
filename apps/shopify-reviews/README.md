# Klyna Reviews

**Photo reviews, UGC & rich-snippet stars that build trust and rank.**

An embedded Shopify app that collects verified star + photo reviews, asks buyers
to review automatically after fulfillment, gives merchants a moderation queue,
and publishes `AggregateRating` JSON-LD so Google shows your stars in search.
Built on the official Shopify App Remix template with the Klyna shared engine
(`@klyna/core`) plugged in for schema generation.

## ⚠️ What you need before running

This app requires a Shopify Partner account because the OAuth flow can't work
without app credentials. The build itself is fully scaffolded and complete.

1. **Shopify Partner account** — free at <https://partners.shopify.com>
2. **A development store** — create one from the Partner dashboard
3. **Shopify CLI 3** — install once globally:
   ```bash
   pnpm add -g @shopify/cli@latest
   ```

## Features

- **Star + photo reviews** — a Theme App Extension drops a reviews widget and a
  "write a review" form (with photo upload) onto the product page. No theme edits.
- **Review-request automation** — an `orders/fulfilled` webhook queues a
  templated review request per purchased product, scheduled N days after
  fulfillment. Requests carry a signed token so the review is marked
  *verified purchase*.
- **Moderation queue** — approve, reply to, reject, or spam-flag every incoming
  review. Optional auto-publish for 4–5★ verified reviews.
- **Rich-snippet stars (SEO)** — published reviews recompute a per-product
  aggregate that is mirrored into a `klyna_reviews.aggregate` product metafield
  and emitted as `Product` + `AggregateRating` JSON-LD via the storefront block
  (reuses `@klyna/core`’s schema builders).
- **Analytics** — average rating, star distribution, reviews-per-month trend,
  photo coverage, and the review-request funnel / response rate.

## First-time setup

```bash
cd apps/shopify-reviews

# 1. Install deps (from the monorepo root, or here)
pnpm install

# 2. Create the Prisma SQLite DB for sessions + reviews
cp .env.example .env
pnpm prisma:generate
pnpm prisma:migrate   # applies the Postgres schema

# 3. Link to a Shopify app (creates one in your Partner account or links existing)
pnpm shopify app config link
# → choose "Create a new app" → name it "Klyna Reviews"
# → the CLI rewrites shopify.app.toml with your real client_id

# 4. Copy the API key + secret from your Partner dashboard into .env
#    (Settings → Apps → Klyna Reviews → API credentials)

# 5. Start the dev server (tunnels through Cloudflare Quick Tunnel)
pnpm dev
# → press 'p' to open the dev store with the app pre-installed
```

### Wire up the storefront widget

1. In the dev store theme editor, add the **Klyna reviews** and **Klyna star
   rating** blocks to the product template (they appear under "App blocks").
2. In the Partner dashboard, add an **App Proxy**:
   - Subpath prefix: `apps` · Subpath: `reviews`
   - Proxy URL: `https://<your-app-host>/apps/reviews`
3. The widget then loads published reviews from `/apps/reviews` and posts new
   submissions back to it (HMAC-verified via `authenticate.public.appProxy`).

## Project layout

```
apps/shopify-reviews/
├── shopify.app.toml             # Shopify app config — CLI rewrites client_id
├── shopify.web.toml             # Tells the Shopify CLI how to run the web role
├── vite.config.ts
├── prisma/schema.prisma         # Session + Review + ProductRating + ReviewRequest + Settings
├── app/
│   ├── shopify.server.ts        # @shopify/shopify-app-remix init
│   ├── db.server.ts             # PrismaClient singleton
│   ├── lib/reviews.server.ts    # aggregate recompute, metafield sync, JSON-LD
│   ├── root.tsx / entry.server.tsx
│   ├── assets/logo.svg          # product logo (star + quote glyph)
│   └── routes/
│       ├── _index/                       # public landing (no shop param)
│       ├── auth.$.tsx / auth.login.tsx   # OAuth
│       ├── app.tsx                       # embedded shell + NavMenu
│       ├── app._index.tsx                # dashboard
│       ├── app.moderation.tsx            # moderation queue (approve/reply/reject)
│       ├── app.requests.tsx              # review-request automation
│       ├── app.analytics.tsx             # rating analytics
│       ├── app.settings.tsx              # widget + automation settings
│       ├── apps.reviews.tsx              # App Proxy: storefront read + submit
│       ├── webhooks.app.uninstalled.tsx
│       └── webhooks.orders.fulfilled.tsx # queues review requests
├── extensions/klyna-reviews-widget/      # Theme App Extension
│   ├── shopify.extension.toml
│   ├── blocks/star-rating.liquid         # compact stars + AggregateRating JSON-LD
│   ├── blocks/review-list.liquid         # full widget + write-a-review form
│   └── assets/klyna-reviews.{js,css}
└── public/favicon.svg                    # = product logo
```

## Data model

| Model           | Purpose                                                            |
| --------------- | ----------------------------------------------------------------- |
| `Session`       | Shopify session storage (required by the framework).              |
| `Review`        | One customer review: rating, body, photos, status, reply, source. |
| `ProductRating` | Cached per-product aggregate (count, average, star distribution). |
| `ReviewRequest` | One queued/sent review request per (order, product).              |
| `Settings`      | Per-shop widget + automation config.                              |

## Status

**Scaffolded and complete — needs Partner credentials + a tunnel to run live.**

- ✅ OAuth + embedded admin (works once `client_id`/secret are in place)
- ✅ Moderation queue with real Prisma loaders/actions + metafield sync
- ✅ Review-request automation via `orders/fulfilled` webhook + manual scheduling
  (querying fulfilled orders through the Admin GraphQL API)
- ✅ Storefront widget (Theme App Extension) reading/writing via the App Proxy
- ✅ `AggregateRating` JSON-LD for rich snippets, via `@klyna/core`
- ✅ Analytics over real review data
- ⏳ **Email delivery is stubbed at the SMTP boundary.** Requests are queued and
  transitioned `scheduled → sent`; wire `KLYNA_SMTP_URL` to an actual relay (or
  Shopify’s email API) to dispatch the templated message. The `/r/:token` magic
  link target is generated and persisted, ready for the email template.
- ⏳ **Photo uploads** are sent inline as data URLs from the widget and stored as
  URLs. For production, swap to a presigned upload to Shopify Files / a bucket.
- ⏳ **Billing** — not wired (Shopify managed pricing is the intended path).

## Deploy

```bash
pnpm shopify app deploy
```

The CLI bundles the app + the theme extension, uploads to Shopify, and creates a
new version draft for App Store review.

## Architecture notes

- **Session + review storage** uses Prisma + SQLite locally. For production, swap
  `DATABASE_URL` to Postgres (Supabase, Neon, Railway, Fly) and `pnpm prisma:migrate`.
- **No paid APIs** — aggregation and schema generation run locally; the Shopify
  Admin API is free. In the spirit of the Klyna stack, nothing leaves your store.
- **The shared engine** — `@klyna/core` provides the `buildProduct` /
  `AggregateRating` schema so rich-snippet output stays identical across the
  WordPress plugin, marketing site, and this app.
