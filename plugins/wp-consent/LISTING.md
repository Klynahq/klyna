# Klyna Consent — WordPress.org Listing Copy

## Plugin name

Klyna Consent — GDPR Cookie Banner & Google Consent Mode v2

---

## Short description (150 chars max)

GDPR / ePrivacy cookie consent banner with Google Consent Mode v2, script blocking, geo-aware display, and a branded admin UI. Free. No APIs.

---

## Long description

**Klyna Consent** is the cleanest, most developer-friendly cookie consent plugin for WordPress. Built by the [Klyna](https://klyna.dev) open indie studio. No SaaS subscription. No external CDN. No jQuery.

### Why Klyna Consent?

Most consent plugins bloat your page, phone home to a third-party SaaS, or require you to connect an account before you can even see a banner. Klyna Consent is different: it's a single plugin, self-hosted, open-source, and ships everything you need for GDPR / ePrivacy compliance out of the box.

### Features

**Consent banner**
A fixed bottom (or top) bar with three buttons: Accept All, Reject All, and Manage Preferences. Every string, colour, and position is configurable from the settings page without touching code.

**Cookie categories**
Four categories — Necessary (always on), Analytics, Marketing, and Preferences. Enable only the categories your site actually uses. Each category maps to the correct Google Consent Mode v2 signal.

**Preferences modal**
A fully accessible popup where visitors can toggle each category individually. Full keyboard navigation, focus trap, Escape to close, ARIA roles throughout.

**Google Consent Mode v2**
Emits default-denied signals in `<head>` at priority 1 — before any GTM or GA snippet. After the user chooses, fires a `gtag('consent','update',...)` with the correct per-category state. Covers all six GCM v2 signals: `analytics_storage`, `ad_storage`, `ad_user_data`, `ad_personalization`, `functionality_storage`, `personalization_storage`.

**Script blocking**
Add `type="text/plain"` and `data-klyna-category="analytics|marketing|preferences"` to any `<script>` tag. Klyna Consent will re-execute it only after the visitor grants consent for that category.

**Geo-aware display**
Optionally show the banner only to visitors from EU/EEA/UK countries. Uses the Cloudflare `CF-IPCountry` header as a best-effort signal. Falls back to always-show if the header is absent.

**Floating re-open button**
After consent is given, a subtle "Cookie settings" button remains on screen so visitors can always change their preferences.

**Branded admin UI**
The settings page is styled with Klyna's violet / zinc design tokens — clear, dark, and readable. No React, no admin-side build step.

**REST API**
`GET /wp-json/wp-consent/v1/settings` exposes the current configuration for headless setups or external tooling (requires `manage_options`).

**Accessibility**
ARIA `dialog` roles on banner and modal, `aria-modal`, `aria-live`, full focus trap in modal, Escape key support, focus-visible rings on all interactive elements.

**i18n ready**
Ships with a `.pot` translation template. All user-facing strings are wrapped in `__()` / `esc_html_e()`.

### Script blocking example

```html
<!-- This script is blocked until the visitor accepts Analytics cookies -->
<script type="text/plain" data-klyna-category="analytics">
  gtag('config', 'G-XXXXXXXXXX');
</script>
```

### Google Consent Mode v2 quick start

1. Activate Klyna Consent.
2. Enable **Google Consent Mode v2** in the settings page.
3. Add your GTM snippet as normal — it will see the correct consent signals automatically.

---

## Keywords / tags (WordPress.org tags, max 5 shown in search)

- gdpr
- cookie consent
- google consent mode
- ccpa
- cookie banner

---

## Additional keywords (for SEO / discovery context)

consent management, ePrivacy, DSGVO, RGPD, TCF, cookie law, cookie notice, analytics blocking, script manager, consent mode v2, gtag, Google Tag Manager, GA4, ad_storage, analytics_storage, WCAG accessible banner, EU cookie law, cookie popup, data privacy, privacy compliance, consent API, consent signal, first-party cookie, SameSite cookie

---

## Promotional tagline (for plugin card header)

> Free. No SaaS. No APIs. Just consent done right.

---

## Icon / banner assets

- **Logo SVG:** `assets/logo.svg` — violet gradient rounded rect + cookie + shield/checkmark glyph
- **Banner colour:** `#7c5cff` → `#5b3df0` diagonal gradient
- **Text on banner:** white `#ffffff`

---

## Support / links

- **Homepage:** https://klyna.dev/products/wp-consent
- **GitHub:** https://github.com/klynahq/klyna
- **Support forum:** WordPress.org plugin support tab
- **Bug reports:** https://github.com/klynahq/klyna/issues
