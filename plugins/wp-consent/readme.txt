=== Klyna Consent ===
Contributors: klynahq
Tags: gdpr, cookie consent, google consent mode, ccpa, cookie banner
Requires at least: 6.4
Tested up to: 6.7
Requires PHP: 8.0
Stable tag: 1.0.0
License: GPL-2.0-or-later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

GDPR / ePrivacy cookie consent banner with Google Consent Mode v2, script blocking, geo-aware display, and a fully branded admin UI. Free. No external APIs.

== Description ==

**Klyna Consent** is a lightweight, accessible, and fully customisable cookie consent solution built for modern WordPress sites. Built by the [Klyna](https://klyna.dev) indie studio.

= Key features =

* **Fixed consent banner** — bottom or top position, fully customisable text, colours, and button labels.
* **Four cookie categories** — Necessary (always on), Analytics, Marketing, and Preferences. Enable only what your site uses.
* **Preferences modal** — keyboard-navigable popup with category toggles, Escape to close, full focus trap.
* **Google Consent Mode v2** — emits default-denied signals in `<head>` before any GTM/GA tag, then fires `gtag('consent','update',...)` after the user chooses. Covers all six signals: `analytics_storage`, `ad_storage`, `ad_user_data`, `ad_personalization`, `functionality_storage`, `personalization_storage`.
* **Script blocking** — tag any `<script>` with `data-klyna-category="analytics|marketing|preferences"` and `type="text/plain"`. Klyna Consent re-executes them only after the user grants consent for that category.
* **Geo-aware display** — optionally show the banner only to EU/EEA/UK visitors. Uses the Cloudflare `CF-IPCountry` header as a best-effort signal; falls back to always-show if the header is absent.
* **Floating re-open button** — a subtle "Cookie settings" button lets visitors change their preferences at any time.
* **Branded admin UI** — settings page styled with Klyna violet / zinc design tokens. No React, no build step required.
* **REST endpoint** — `GET /wp-json/wp-consent/v1/settings` exposes the current config for external tooling (requires `manage_options`).
* **Accessibility** — ARIA roles, focus trap in modal, Escape key support, keyboard-navigable banner. Passes basic WCAG 2.1 AA requirements.
* **No jQuery, no external CDN, no paid APIs.**

= Cookie storage =

Consent is stored in a first-party cookie named `klyna_consent` as a JSON object with a 365-day expiry, `SameSite=Lax`, served from the site's own domain.

= Google Consent Mode v2 quick start =

1. Activate the plugin.
2. Enable **Google Consent Mode v2** in Settings → Klyna Consent.
3. Add your GTM or gtag.js snippet *after* the `<head>` tag as normal — Klyna Consent's default-denied snippet fires at priority 1, before every other `wp_head` hook.
4. That's it. The plugin handles the `update` call when the user makes a choice.

= Script blocking example =

```html
<script type="text/plain" data-klyna-category="analytics">
  // This runs only after the user accepts Analytics cookies.
  gtag('config', 'G-XXXXXXXXXX');
</script>
```

== Installation ==

1. Upload the `wp-consent` folder to `/wp-content/plugins/`.
2. Activate the plugin in **Plugins → Installed Plugins**.
3. Go to **Klyna Consent** in the admin menu and configure your banner.

== Frequently Asked Questions ==

= Does this make my site fully GDPR-compliant? =

The plugin provides the technical mechanism (consent collection, script blocking, GCM v2 signals). Full GDPR compliance also requires a Privacy Policy, correct cookie notices, and legal review appropriate to your jurisdiction. Always consult a lawyer.

= Does it work with Google Tag Manager? =

Yes. Enable Google Consent Mode v2 in the plugin settings. The default-denied snippet fires before GTM initialises. GTM's built-in consent triggers will fire correctly when the user accepts.

= What if Cloudflare is not proxying my site? =

The geo-restrict feature silently falls back to **always showing** the banner if the `CF-IPCountry` header is not present. Enable it only if your site is behind Cloudflare's proxy (orange cloud).

= Can I use this alongside Klyna SEO Suite? =

Yes. The plugins use separate PHP namespaces (`KlynaConsent\` vs `Klyna\`), separate option keys, and separate admin menu entries. They coexist without conflict.

= Where is the consent cookie stored? =

In the user's browser as `klyna_consent` (JSON, 365 days, `SameSite=Lax`, path `/`). Nothing is stored server-side.

== Screenshots ==

1. Front-end consent banner (bottom position, dark theme).
2. Preferences modal with category toggles.
3. Floating "Cookie settings" re-open button.
4. Admin settings page — banner content section.
5. Admin settings page — appearance / colour picker.
6. Admin settings page — integrations and cookie categories.

== Changelog ==

= 1.0.0 =
* Initial release.
* Banner with Accept All / Reject All / Manage Preferences.
* Preferences modal with focus trap and Escape key support.
* Google Consent Mode v2 default + update signals.
* Script blocking via `data-klyna-category` attribute.
* Geo-restrict via Cloudflare `CF-IPCountry` header.
* Floating "Cookie settings" re-open button.
* Branded admin settings page.
* REST endpoint `wp-consent/v1/settings`.
* Full i18n (.pot file included).

== Upgrade Notice ==

= 1.0.0 =
Initial release — no upgrade steps required.
