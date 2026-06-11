# Klyna Security Audit — 2026-06-12

## Summary
- **Total findings:** 14 across 21 products (10 Shopify apps + 10 WP plugins + main monorepo).
- **Critical:** 0.
- **Fixed in this audit:** 0 (per scope rules — no in-place fixes to avoid conflict with concurrent build agents).

Overall posture is good. The plugin/app authors consistently:
- Use prepared statements (every `$wpdb->query/get_*` either uses `prepare()` or only interpolates `$wpdb->prefix`).
- Gate admin routes with `current_user_can( 'manage_options' )` (and most also require a `wp_rest` nonce).
- Scope every Prisma read/write by `session.shop` after `authenticate.admin(request)`.
- Sanitize inputs at the REST boundary (`sanitize_text_field`, `sanitize_email`, `absint`, `sanitize_textarea_field`).
- Cap AI usage with a per-shop daily quota (`aiUsage.upsert` in every Shopify app's `app/lib/ai.server.ts`).
- Keep BYOK API keys in the merchant's own DB; the Shopify apps never proxy keys through klyna.dev.

The findings below are mostly defense-in-depth gaps and one class of design issue: a small set of public storefront endpoints in the Shopify apps accept a client-supplied `shop` parameter (CORS `*`) instead of requiring the signed Shopify App Proxy. The code authors flag this explicitly in comments as a known posture choice ("you'd front this with a Shopify App Proxy in production"), so it's a known-debt HIGH rather than a hidden bug.

## Critical (fixed in this audit)

None.

## Critical (NOT fixed — needs follow-up)

None.

## High

### H1. Public storefront endpoints accept client-supplied `shop` without app-proxy signature
The "Notify me" and cart-upsell endpoints are open to the public internet with `Access-Control-Allow-Origin: *` and trust `body.shop` / `?shop=` as identity. The only gate is that the shop has an installed session row.

- `klyna-shopify-restock/apps/shopify-restock/app/routes/api.subscribe.tsx:44-50` — writes `Subscriber` / `QueuedNotification` rows for any caller-supplied shop that happens to be installed. Comment at lines 11-13 admits the gap.
- `klyna-shopify-upsell/apps/shopify-upsell/app/routes/api.offers.tsx:32-89` (GET) and `:92-132` (POST) — same pattern, plus client-supplied `revenue` written into `OfferEvent.revenue`.

**Why HIGH and not CRITICAL:** the data leak is limited to *publicly* configured offers / waitlist signups, and the write surface is constrained to event/queue rows. A malicious actor can spam-subscribe arbitrary emails to a competitor's waitlist (leading to a notification email out to the recipient when the variant restocks) and inflate offer impression/accept counters.

**Fix:** route both endpoints through Shopify App Proxy (`authenticate.public.appProxy(request)` like `klyna-shopify-bundles/apps/shopify-bundles/app/routes/api.storefront.tsx:17` already does) and lock CORS to `https://*.myshopify.com` + the merchant's primary domain. Also rate-limit by `(shop, ip)` per minute.

### H2. wp-speed admin SSRF via AI-suggest URL list, with TLS verification disabled
- `klyna-wp-speed/plugins/wp-speed/includes/class-rest.php:156-174` (`ai_suggest`) accepts a `urls` array from the admin and passes each to `sample_url()`.
- `:263-271` (`sample_url`) calls `wp_remote_get( $url, [ 'sslverify' => false, 'redirection' => 2, … ] )`.

The route is `manage_options`-gated, so the attacker must already be admin — but a compromised admin / lower-privileged subscriber via XSS on an admin page (the AI keys are rendered inline in admin HTML, see M2) can then pivot to internal services (e.g. `http://169.254.169.254/`, `http://localhost:6379`). `sslverify=false` also enables on-path MITM of probed URLs.

**Fix:**
1. Drop `sslverify => false`.
2. Validate each URL is HTTPS and that its host resolves to a public IP (reject RFC1918, loopback, link-local, metadata IPs). The well-known mitigation is a DNS resolve + `inet_pton` check before the request and `WP_Http::block_request` allowlist.
3. Cap the response body via `'limit_response_size'` so the AI prompt can't be cost-amplified by a 50 MB internal page.

## Medium

### M1. wp-popups webhook (admin-configured URL) lacks SSRF guards
- `klyna-wp-popups/plugins/wp-popups/includes/class-entries.php:280-312` posts every subscription to `Plugin::setting('webhook_url')`. Only `wp_http_validate_url()` is checked — which does NOT block `http://127.0.0.1/`, `http://[::1]/`, `http://169.254.169.254/`, etc. An admin who is tricked into setting a malicious webhook URL leaks every captured email + name to the attacker; the WP host can also be coerced into requesting internal services.

**Fix:** add the same public-IP allowlist used for H2, restrict to `https://`, and document on the settings UI that the webhook secret HMAC is required.

### M2. AI API keys rendered inline in admin HTML
Every WP plugin's settings page outputs the BYOK key into the response body:
`<input type="password" name="…[ai_api_key]" value="<?php echo esc_attr( $settings['ai_api_key'] ); ?>">`

Examples:
- `klyna-wp-booking/plugins/wp-booking/includes/class-admin.php:405`
- `klyna-wp-analytics/plugins/wp-analytics/includes/class-admin.php:364`
- `klyna-wp-popups/plugins/wp-popups/includes/class-admin.php:364`
- `klyna-wp-forms/plugins/wp-forms/includes/class-admin.php:1016`
- `klyna-wp-feed/plugins/wp-feed/includes/class-admin.php:499`
- `klyna-wp-tables/plugins/wp-tables/includes/class-admin.php:246`
- `klyna-wp-speed/plugins/wp-speed/includes/class-admin.php:512`
- `klyna-wp-consent/plugins/wp-consent/includes/class-admin.php:524`

Type=password masks the screen but the key is cleartext in the HTML the browser receives, and is therefore exposed to any DOM-reading XSS on the admin page, browser memory dumps, and HAR captures shared for support.

**Fix:** render only the boolean `has_key` and a "Replace key" affordance; show the last 4 chars max. The wp-analytics plugin already has the `$has_key` variable at `class-admin.php:335` — extend that pattern everywhere and never echo the raw key.

### M3. klyna.dev website missing security headers
- `klyna/apps/website/src/layouts/BaseLayout.astro` — no CSP, no `X-Frame-Options`, no `Strict-Transport-Security`, no `X-Content-Type-Options`, no `Referrer-Policy`. (Vercel defaults are minimal.) NOT FIXED here because the website is being actively modified by other build agents per scope rules.

**Fix:** add a `headers()` block in `vercel.json` at the repo root, or set them in middleware. Spec calls for `default-src 'self'`, `frame-ancestors 'none'`, `script-src 'self' 'sha256-…'`.

## Low / defense-in-depth

### L1. Non-constant-time secret comparison on cron endpoints
- `klyna-shopify-restock/apps/shopify-restock/app/routes/api.cron.restock-tick.tsx:19` — `header === secret`.
- `klyna-shopify-feed/apps/shopify-feed/app/routes/cron.refresh.tsx:23` — `provided !== secret`.

A remote timing-attack is impractical at internet RTT but the canonical fix is `crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(secret))` (with length pre-check).

### L2. Cron secret accepted via query string
- `klyna-shopify-feed/apps/shopify-feed/app/routes/cron.refresh.tsx:19` accepts `?key=…`. Query strings leak into access logs, browser history, Referer headers, and HTTP caches. Require the `Authorization` header instead.

### L3. wp-booking public/admin endpoints rely on capability without an explicit nonce check
- `klyna-wp-booking/plugins/wp-booking/includes/class-rest.php:155-157` — `check_admin` returns `current_user_can( 'manage_options' )` only. `update_status` (`:135`) and `list_bookings` (`:81`) use it.

When the request authenticates via cookie WordPress core requires a `wp_rest` nonce anyway, so this is fine in practice — but the codebase already has `check_admin_nonce` (`:162-171`) and using it consistently would be more defense-in-depth.

### L4. Forms public submit has no per-IP rate limit
- `klyna-wp-forms/plugins/wp-forms/includes/class-submission.php:51` — nonce + honeypot + time-trap gate submissions but there's no IP throttle equivalent to `wp-booking`'s `RATE_LIMIT = 8 / HOUR`. Bots that scrape the nonce can still flood the entries table.

### L5. wp-popups webhook payload includes PII without consent gating
- `klyna-wp-popups/plugins/wp-popups/includes/class-entries.php:285-296` — emails + names are sent to the configured webhook on every capture. There's no privacy-mode toggle; combined with M1's SSRF risk this is worth a settings-page warning.

### L6. Analytics `/collect` endpoint clamps payload sizes via sanitizer but not via a hard byte cap
- `klyna-wp-analytics/plugins/wp-analytics/includes/class-rest.php:212-243` — `path` is capped by `sanitize_path` (~ regex-pruned) but the REST body itself is bounded only by PHP `post_max_size`. The spec calls for a 2KB cap at the edge.

## Per-product summary

| Product | Critical | High | Medium | Low |
| --- | ---: | ---: | ---: | ---: |
| klyna (monorepo / website) | 0 | 0 | 1 (M3) | 0 |
| klyna-shopify-bundles | 0 | 0 | 0 | 0 |
| klyna-shopify-capture | 0 | 0 | 0 | 0 |
| klyna-shopify-feed | 0 | 0 | 0 | 2 (L1, L2) |
| klyna-shopify-restock | 0 | 1 (H1) | 0 | 1 (L1) |
| klyna-shopify-reviews | 0 | 0 | 0 | 0 |
| klyna-shopify-rewards | 0 | 0 | 0 | 0 |
| klyna-shopify-sticky-cart | 0 | 0 | 0 | 0 |
| klyna-shopify-upsell | 0 | 1 (H1) | 0 | 0 |
| klyna-shopify-urgency | 0 | 0 | 0 | 0 |
| klyna-shopify-wishlist | 0 | 0 | 0 | 0 |
| klyna-wp-analytics | 0 | 0 | 1 (M2) | 1 (L6) |
| klyna-wp-booking | 0 | 0 | 1 (M2) | 1 (L3) |
| klyna-wp-consent | 0 | 0 | 1 (M2) | 0 |
| klyna-wp-feed | 0 | 0 | 1 (M2) | 0 |
| klyna-wp-forms | 0 | 0 | 1 (M2) | 1 (L4) |
| klyna-wp-popups | 0 | 0 | 2 (M1, M2) | 1 (L5) |
| klyna-wp-redirects | 0 | 0 | 0 | 0 |
| klyna-wp-reviews | 0 | 0 | 0 | 0 |
| klyna-wp-speed | 0 | 1 (H2) | 1 (M2) | 0 |
| klyna-wp-tables | 0 | 0 | 1 (M2) | 0 |

Note: M2 (AI API key rendered in HTML) is counted once per affected plugin since each ships its own admin page; the fix is identical across all of them.

## Recommended next steps

1. Fix H1 by routing the storefront endpoints through `authenticate.public.appProxy` — uniform pattern is already in use elsewhere (`shopify-bundles/api.storefront.tsx`).
2. Fix H2 by adding a `safeRemoteGet()` helper to a shared util that rejects private IPs and enforces TLS verification, then call it from `wp-speed`.
3. Sweep M2 across all WP plugins in one PR by introducing a shared `Klyna_AI_Settings_Renderer` helper.
4. Add the `vercel.json` headers block + Astro middleware for M3 once the website agent's current work lands.
5. The L-tier items are small and can be batched into a "security hardening" PR.
