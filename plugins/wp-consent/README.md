# Klyna Consent — WordPress Plugin

> GDPR / ePrivacy cookie consent banner with Google Consent Mode v2, script blocking, geo-aware display, and a fully branded admin UI. Free. No external APIs.

**Plugin slug:** `wp-consent`  
**Version:** 1.0.0  
**PHP namespace:** `KlynaConsent\`  
**Option key:** `wp_consent_settings`  
**Text domain:** `wp-consent`  
**REST namespace:** `wp-consent/v1`

---

## STATUS

| Feature | Status |
|---|---|
| Consent banner (bottom/top, custom colours) | Done |
| Four cookie categories (Necessary, Analytics, Marketing, Preferences) | Done |
| `klyna_consent` JSON cookie (365-day, SameSite=Lax) | Done |
| Preferences modal with focus trap + Escape | Done |
| Google Consent Mode v2 (default + update signals) | Done |
| Script blocking via `data-klyna-category` | Done |
| Geo-restrict (CF-IPCountry) | Done |
| Floating "Cookie settings" re-open button | Done |
| Admin settings page (Klyna violet/zinc theme) | Done |
| REST endpoint `GET /wp-json/wp-consent/v1/settings` | Done |
| Accessibility (ARIA, focus trap, keyboard nav) | Done |
| i18n (.pot file) | Done |
| uninstall.php (clean removal) | Done |

---

## File structure

```
plugins/wp-consent/
├── wp-consent.php                 # Plugin header, constants, autoloader, hooks
├── includes/
│   ├── class-plugin.php           # Orchestrator — boots all subsystems
│   ├── class-banner.php           # Renders HTML banner + modal, enqueues assets
│   ├── class-consent-mode.php     # Emits GCM v2 default snippet in <head>
│   ├── class-admin.php            # Admin settings page + sanitisation
│   └── class-rest.php             # REST endpoint (GET + PATCH /settings)
├── assets/
│   ├── js/
│   │   └── banner.js              # Vanilla JS: cookie r/w, banner, modal, GCM, script unblocking
│   ├── css/
│   │   └── banner.css             # Banner + modal styles (CSS custom properties, mobile-first)
│   ├── admin/
│   │   ├── admin.css              # Admin page (Klyna violet/zinc tokens)
│   │   └── admin.js               # Admin JS: colour picker sync
│   └── logo.svg                   # Klyna gradient rect + cookie+shield glyph
├── languages/
│   └── wp-consent.pot             # Translation template
├── uninstall.php                  # Deletes option on plugin deletion
├── readme.txt                     # WordPress.org plugin readme
├── README.md                      # This file
└── LISTING.md                     # WordPress.org listing copy + keywords
```

---

## Coexistence with Klyna SEO Suite

The SEO Suite uses:
- PHP namespace `Klyna\`
- Constants `KLYNA_*`
- Option key `klyna_settings`
- Text domain `klyna`

This plugin uses:
- PHP namespace `KlynaConsent\`
- Constants `KLYNA_CONSENT_*`
- Option key `wp_consent_settings`
- Text domain `wp-consent`
- Admin menu position 76 (SEO Suite is at 65)

There is zero conflict. Both plugins can be active simultaneously.

---

## Google Consent Mode v2 — how it works

1. `class-consent-mode.php` hooks `wp_head` at **priority 1** and emits:
   ```js
   gtag('consent','default',{ analytics_storage:'denied', ... });
   ```
   This fires before any GTM / GA snippet (which typically hooks at priority 10+).

2. After the user clicks Accept All / Reject All / Save Preferences, `banner.js` fires:
   ```js
   gtag('consent','update',{ analytics_storage:'granted', ... });
   ```
   Signals are mapped: Analytics → `analytics_storage`, Marketing → `ad_storage` + `ad_user_data` + `ad_personalization`, Preferences → `functionality_storage` + `personalization_storage`.

3. On subsequent page loads where a `klyna_consent` cookie already exists, `banner.js` immediately fires the `update` call (before DOMContentLoaded resolves) so GTM sees correct signals before firing tags.

---

## Script blocking

Tag any third-party `<script>` you want blocked until consent:

```html
<script type="text/plain" data-klyna-category="analytics">
  window.dataLayer = window.dataLayer || [];
  gtag('config', 'G-XXXXXXXXXX');
</script>
```

`banner.js` scans for `script[type="text/plain"][data-klyna-category]` and, after the user grants consent for that category, clones the script node without `type="text/plain"` so the browser executes it.

---

## Dev setup

No build step required. This plugin is plain PHP + vanilla JS + CSS.

```bash
# Drop into your WP plugins directory
cp -r plugins/wp-consent /path/to/wp-content/plugins/

# Or symlink for live editing
ln -s "$(pwd)/plugins/wp-consent" /path/to/wp-content/plugins/wp-consent
```

Activate in WP Admin → Plugins, then visit **Klyna Consent** in the menu.

---

## Sanitisation & security

- All admin form input passes through `Admin::sanitize_settings()` (registered with `register_setting`).
- REST PATCH input passes through `Rest::sanitize_rest_input()`.
- All output is escaped with `esc_html`, `esc_attr`, `esc_url`, `wp_kses_post`.
- REST endpoint requires `manage_options` capability — no unauthenticated writes.
- No nonce is needed for the front-end banner cookie (it's purely client-side JS writing to `document.cookie`).
- Colour inputs are validated with `sanitize_hex_color()`.
- Position field accepts only `'top'` or `'bottom'`.
