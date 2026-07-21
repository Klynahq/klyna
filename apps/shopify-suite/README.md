# Klyna Shopify Suite

Shared source for the next Klyna Shopify App Store batch.

One codebase supports five public app listings through `KLYNA_PRODUCT`:

- `cleanroom` - Klyna Cleanroom
- `promo-qa` - Klyna Promo QA
- `redirect-guard` - Klyna Redirect Guard
- `pixel-doctor` - Klyna Pixel Doctor
- `feed-doctor` - Klyna Feed Doctor

Each public app should get its own Shopify Partners app, Vercel project, database,
pricing plan, listing copy, and screenshots. Point each Vercel project at this
directory and set `KLYNA_PRODUCT` to the matching key.

## Local dev

```bash
corepack enable pnpm
pnpm install
cd apps/shopify-suite
KLYNA_PRODUCT=cleanroom pnpm dev -- --store=klynadev.myshopify.com --config shopify.app.cleanroom.toml
```

## Product envs

- `KLYNA_PRODUCT`: one of the five product keys.
- `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_APP_URL`, `SCOPES`
- `DATABASE_URL`, `DIRECT_URL`

## Review posture

The app is intentionally diagnostic-first and read-mostly. Cleanup, writes, and
destructive actions must remain explicit, previewed, backed up, and reversible.
