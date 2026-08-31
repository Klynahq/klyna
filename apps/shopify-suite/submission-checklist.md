# Klyna Shopify Suite submission checklist

This directory is one shared source for five public Shopify apps. Each app still needs its own Shopify Partners app, Vercel project, environment, database, billing plan, screenshots, and App Store listing.

## Apps

| Product | Env value | Config | Production URL |
| --- | --- | --- | --- |
| Klyna Cleanroom | `cleanroom` | `shopify.app.cleanroom.toml` | `https://klyna-cleanroom.vercel.app` |
| Klyna Promo QA | `promo-qa` | `shopify.app.promo-qa.toml` | `https://klyna-promo-qa.vercel.app` |
| Klyna Redirect Guard | `redirect-guard` | `shopify.app.redirect-guard.toml` | `https://klyna-redirect-guard.vercel.app` |
| Klyna Pixel Doctor | `pixel-doctor` | `shopify.app.pixel-doctor.toml` | `https://klyna-pixel-doctor.vercel.app` |
| Klyna Feed Doctor | `feed-doctor` | `shopify.app.feed-doctor.toml` | `https://klyna-feed-doctor.vercel.app` |

## Required env per Vercel project

- `KLYNA_PRODUCT`
- `SHOPIFY_API_KEY`
- `SHOPIFY_API_SECRET`
- `SHOPIFY_APP_URL`
- `SCOPES`
- `DATABASE_URL`
- `DIRECT_URL`

## Local validation

```bash
corepack enable pnpm
pnpm install
pnpm --filter shopify-suite prisma:generate
pnpm --filter shopify-suite typecheck
pnpm --filter shopify-suite build
pnpm --filter website build
```

## Current validation status

Dev-store validation checked on 2026-07-19:

- Dev-store embedded tests passed for Cleanroom, Promo QA, Redirect Guard, Pixel Doctor, and Feed Doctor.
- Each app loaded inside Shopify admin, ran its primary diagnostic action, saved scan history, and opened its fix playbook.
- Redirect Guard now has the required `read_online_store_navigation` scope for redirect checks.
- Product-scoped session storage is in place so the five apps do not reuse each other's offline tokens when sharing a database.
- `pnpm typecheck` passes for the monorepo.
- `pnpm --filter shopify build` and `pnpm --filter shopify-suite build` pass.
- Scoped Shopify source lint passes:
  `pnpm exec biome check apps/shopify/app apps/shopify/prisma apps/shopify/*.toml apps/shopify/*.json apps/shopify/*.ts apps/shopify-suite/app apps/shopify-suite/prisma apps/shopify-suite/*.toml apps/shopify-suite/*.json apps/shopify-suite/*.ts apps/shopify-suite/*.md`
- Shopify CLI config validation passes for all five suite TOMLs.

Production readiness rechecked on 2026-09-01:

- Cleanroom, Promo QA, Redirect Guard, Pixel Doctor, and Feed Doctor production roots all return HTTP 200.
- Promo QA and Pixel Doctor production pages resolve with the correct product identity.
- `pnpm --filter shopify-suite typecheck` passes.
- `pnpm --filter shopify-suite build` passes.
- Promo QA and Pixel Doctor each have four authentic 1600x900 App Store screenshots, a 1920x1080 reviewer walkthrough, product-specific listing copy, pricing, and review guardrails.
- The authenticated Shopify Partner dashboard remains the source of truth for reviewer feedback and final listing status. Recheck it immediately before submission.

## Dev-store test flow

1. Link the matching TOML to a real Partners app.
2. Set the matching `KLYNA_PRODUCT`.
3. Start `pnpm dev -- --store=klynadev.myshopify.com --config <config-file>`.
4. Install on the dev store.
5. Confirm embedded admin loads without blank screen.
6. Run the diagnostic scan.
7. Open scan history.
8. Open fix playbook.
9. Uninstall and reinstall to confirm OAuth/session behavior.
10. Check the mandatory GDPR webhook URLs are registered.

## Submission rule

Do not submit until each app has a real production deployment, a real database, successful dev-store install, screenshots from the embedded app, Shopify Billing configured for paid plans, and all requested App Store fields filled with product-specific copy from `listings/`.
