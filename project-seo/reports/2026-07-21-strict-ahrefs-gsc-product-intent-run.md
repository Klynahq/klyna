# Klyna strict Ahrefs/GSC product-intent run - 2026-07-21

## Summary

Shipped count: `24`

This strict run used same-day GSC and Ahrefs/RankyTools evidence to focus on brand/product discovery. GSC showed early Klyna-branded impressions/clicks on the homepage and products page. Ahrefs/RankyTools showed the homepage ranking for the brand query and a low organic footprint, so the run strengthened the path from brand/product searches into products, downloads, help, and contact.

## Research used

- GSC 3-month Web snapshot: 2 clicks, 76 impressions, 2.6% CTR, 14.5 average position.
- GSC visible queries: `klyna`, `kalyna marketing`, and low-volume brand variants.
- GSC visible pages: homepage, HTTP homepage variant, and `/products`.
- Ahrefs/RankyTools overview: DR 0.1, 336 backlinks, 263 referring domains, 1 organic keyword, homepage top keyword `klyna` at visible position 8.
- Ahrefs limitation: inactive/sparse row-table access limited full organic keyword, content-gap, anchor, and backlink exports.

## Shipped tasks

- Added a visible `Search intent to satisfy` product-path block to the homepage.
- Added a visible `Search intent to satisfy` product-choice block to `/products`.
- Added a `Search intent to satisfy` section to 22 product-intent guides, each tying the search problem to Klyna products, help docs, downloads, and contact.

## QA plan

- `pnpm --filter website build` passed on the clean worktree.
- Built HTML QA passed for 24 URLs plus sitemap.
- Live QA passed for 24 URLs plus sitemap on:
  - `https://klyna-7zdw7wg0t-adnanaimanager-3376s-projects.vercel.app`
  - `https://klyna.dev`
- Monitor GSC for brand/product impressions and request indexing for materially updated pages when URL Inspection is stable.

## Deployment

- Commit: `a759bbf` (`Add strict product-intent search paths`)
- Vercel deployment: `dpl_odubeEqyJoUSv4aKh4T2gjADvYtd`
- Production alias: `https://klyna.dev`

## Backlink / risk

- No outreach sent.
- Reject spam/link-seller/PBN/scraped backlinks and do not auto-disavow unless GSC/manual-action or verified followed-link risk appears.
