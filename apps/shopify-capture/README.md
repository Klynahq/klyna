# Klyna Capture

**Email & SMS popups, spin-to-win & exit-intent that grow your list.**

A Shopify embedded app that turns storefront visitors into subscribers — and
writes every opt-in straight into Shopify customers with email and SMS
marketing consent. No per-impression billing, no data leaving your store.

Part of [Klyna](https://klyna.dev) — _Tools that help your work get found._

## What it does

- **Popup builder** — email capture, SMS capture, email + SMS, or a
  spin-to-win wheel. Headline, body, button, success message, accent color,
  and an optional discount code revealed on signup. Live preview as you edit.
- **Spin-to-win** — weighted-odds prize wheel. Each segment has a label,
  discount code, color, and weight; a winning segment is picked server-side
  fairly and revealed after the spin animation.
- **Triggers** — show after a time delay, at a scroll-depth threshold, or on
  exit intent (cursor leaving the viewport on desktop, fast scroll-up on
  mobile).
- **Targeting rules** — by page type (home / product / collection / cart /
  all), device (desktop / mobile / all), and audience (new vs returning
  visitors), with a per-visitor re-show cooldown.
- **Writes to Shopify customers** — on opt-in the contact is created via the
  Admin GraphQL API with `emailMarketingConsent` / `smsMarketingConsent`, so
  it lands in your marketing audience immediately. Already-a-customer is
  treated as a soft success.
- **Conversion analytics** — impressions, conversions, dismissals, and
  conversion rate, per campaign and store-wide.

## ⚠️ STATUS

This app is **fully built but not yet runnable live** — it needs credentials
you have to create:

- The OAuth flow can't work without a **Shopify Partner `client_id`/secret**.
  `shopify.app.toml` ships a placeholder `client_id`; `shopify app config link`
  rewrites it with your real key.
- `shopify app dev` provisions the **public tunnel URL** the embedded app and
  App Proxy need. Until then there's no `SHOPIFY_APP_URL` to authenticate
  against.

Everything else is real: the Prisma models, the admin routes (loaders/actions
hitting the Admin GraphQL API and persisting via Prisma), the signed App Proxy
endpoints, and the theme app extension widget. Once you link a Partner app and
run `pnpm dev`, it works end to end on a dev store. No code is stubbed — the
"coming soon" placeholders from the reference template are gone.

## What you need before running

1. **Shopify Partner account** — free at <https://partners.shopify.com>
2. **A development store** — create one from the Partner dashboard
3. **Shopify CLI 3** — install once globally:
   ```bash
   pnpm add -g @shopify/cli@latest
   ```

## First-time setup

```bash
cd apps/shopify-capture

# 1. Install deps
pnpm install

# 2. Create the Prisma SQLite DB for session + app storage
cp .env.example .env
pnpm prisma:generate
pnpm prisma:migrate          # creates dev.sqlite

# 3. Link to a Shopify app (creates one in your Partner account, or links existing)
pnpm shopify app config link
# → choose "Create a new app" → name it "Klyna Capture"
# → the CLI rewrites shopify.app.toml with your real client_id

# 4. Copy the API key + secret from your Partner dashboard into .env
#    (Settings → Apps → Klyna Capture → API credentials)

# 5. Start the dev server (tunnels through Cloudflare Quick Tunnel)
pnpm dev
# → press 'p' to open the dev store with the app pre-installed
```

### Turn on the storefront widget

Popups only render once the theme app embed is enabled:

**Online Store → Themes → Customize → App embeds → Klyna Capture → toggle on.**

Pick a position (center modal / bottom corner) and save. Then activate a popup
from the app's **Popups** tab and it will show on the storefront per its
trigger and targeting rules.

## Project layout

```
apps/shopify-capture/
├── shopify.app.toml              # App config (client_id rewritten by CLI) + App Proxy
├── shopify.web.toml              # Tells the Shopify CLI how to run the web role
├── vite.config.ts
├── prisma/schema.prisma          # Session + Popup + Subscriber + PopupEvent
├── app/
│   ├── shopify.server.ts         # @shopify/shopify-app-remix init
│   ├── db.server.ts              # PrismaClient singleton
│   ├── root.tsx                  # HTML shell
│   ├── entry.server.tsx          # Remix SSR entry
│   ├── assets/logo.svg           # Product logo (also the favicon)
│   ├── lib/
│   │   ├── popups.ts             # Shared types, defaults, validation
│   │   └── customer-sync.server.ts  # Admin GraphQL customerCreate + consent
│   └── routes/
│       ├── _index/                 # Public landing (when shop param is absent)
│       ├── auth.$.tsx              # OAuth callback (catch-all)
│       ├── auth.login.tsx          # Manual login form
│       ├── app.tsx                 # Embedded app shell + NavMenu
│       ├── app._index.tsx          # Dashboard (live KPIs)
│       ├── app.popups._index.tsx   # Popup list (IndexTable, create/delete)
│       ├── app.popups.$id.tsx      # Popup builder + live preview
│       ├── app.subscribers.tsx     # Captured contacts + sync retry
│       ├── app.analytics.tsx       # Conversion funnel per campaign
│       ├── proxy.config.tsx        # App Proxy: active campaigns for the widget
│       ├── proxy.capture.tsx       # App Proxy: record opt-in + write customer
│       ├── proxy.event.tsx         # App Proxy: impression/dismiss events
│       └── webhooks.app.uninstalled.tsx
└── extensions/
    └── capture-widget/           # Theme app extension (storefront popup)
        ├── shopify.extension.toml
        ├── blocks/capture.liquid # App embed block + settings schema
        ├── assets/klyna-capture.js   # Widget runtime (no deps)
        ├── assets/klyna-capture.css
        └── locales/en.default.json
```

## How the storefront talks to the app

The theme app embed loads `klyna-capture.js`, which calls three **signed App
Proxy** paths (configured under `[app_proxy]` in `shopify.app.toml`):

| Storefront path                  | App route        | Purpose                         |
| -------------------------------- | ---------------- | ------------------------------- |
| `/apps/klyna-capture/config`     | `proxy.config`   | Fetch active campaigns          |
| `/apps/klyna-capture/capture`    | `proxy.capture`  | Record opt-in, write customer   |
| `/apps/klyna-capture/event`      | `proxy.event`    | Log impression / dismiss        |

Every proxy request is HMAC-signed by Shopify and verified with
`authenticate.public.appProxy`. The capture endpoint uses an offline admin
client (`unauthenticated.admin`) to write the customer with marketing consent.

## Deploy

```bash
pnpm shopify app deploy
```

The CLI bundles the app **and the theme app extension**, uploads to Shopify,
and creates a new App Store version draft.

## Architecture notes

- **Session + app data** use Prisma + SQLite locally. For production, point
  `DATABASE_URL` at Postgres (Supabase, Neon, Railway, Fly) and
  `pnpm prisma:migrate`.
- **Access scopes:** `read_customers,write_customers,read_products,read_themes`.
  Customer write is what lets opt-ins land in your marketing audience;
  `read_products`/`read_themes` let the builder mirror store branding.
- **No paid APIs.** Every analytics aggregate runs locally; the Admin API is
  free. No third-party ESP required — consent is written into Shopify itself.
- **No dark patterns.** Cooldowns are respected, dismissal is always one click,
  and the fine print states consent plainly.
