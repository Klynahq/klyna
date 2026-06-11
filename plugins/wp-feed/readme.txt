=== Klyna Product Feed ===
Contributors: klyna
Tags: woocommerce, google shopping, product feed, meta, facebook catalog
Requires at least: 6.4
Tested up to: 6.7
Requires PHP: 8.0
Stable tag: 0.1.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

WooCommerce product feeds for Google Shopping & Meta, auto-refreshed. Field mapping, category/stock filters, feed health warnings. No paid APIs.

== Description ==

**Klyna Product Feed** turns your WooCommerce catalog into ready-to-submit product feeds for **Google Merchant Center** and **Meta Commerce Manager** — and keeps them fresh automatically with WP-Cron.

Built by [Klyna](https://klyna.dev), an indie studio. Tools that help your work get found.

= What it does =

* Generates a **Google Shopping XML** feed (RSS 2.0 with the `g:` namespace) from your published WooCommerce products.
* Generates a **Meta product CSV** feed in the column layout Meta Commerce Manager expects.
* **Field mapping** for the attributes Google and Meta care about: `gtin`, `brand`, `condition`, `google_product_category`, `mpn`, `item_group_id`. Map each from a product meta key, with a sitewide default fallback.
* **Include / exclude by category** and an **in-stock-only** toggle, so you only export what you want to advertise.
* **Scheduled regeneration** via WP-Cron (hourly, twice daily, or daily). Each feed is served from a clean, token-protected **public URL** you paste straight into Google or Meta.
* **Feed health warnings** — scans your catalog for products missing required fields (image, price, GTIN/brand, short descriptions) before you submit, so you avoid disapprovals.
* Variable products are exported as their individual variations, grouped with `item_group_id`.
* All processing runs on **your server**. No third-party APIs, no API keys, no data leaves your site.

= Degrades gracefully =

If WooCommerce is not active, the plugin stays dormant and tells you so — it never fatals and never touches a catalog that does not exist.

= Why we built it =

Most feed plugins gate the basics behind a subscription. Klyna Product Feed ships the whole core loop — generate, schedule, validate, serve — as an open plugin with no paid tier in the default stack.

== Installation ==

1. Upload the `wp-feed` folder to `/wp-content/plugins/`.
2. Activate the plugin from **Plugins** in the WordPress admin.
3. Make sure **WooCommerce** is installed and active.
4. Visit **Klyna Feed → Settings** to choose your formats, schedule, field mappings, and category filters.
5. Visit **Klyna Feed → Dashboard**, click **Regenerate now**, then copy each public feed URL into Google Merchant Center / Meta Commerce Manager.

== Frequently Asked Questions ==

= Does it require WooCommerce? =

Yes. Klyna Product Feed reads its catalog from WooCommerce. Without WooCommerce active, the plugin stays inert (no errors) and the admin tells you what to do.

= Does it call any external services? =

No. Feeds are generated on your own server in pure PHP. Nothing is sent anywhere — you submit the public feed URL to Google/Meta yourself.

= How do the public feed URLs work? =

Each feed is served from a clean URL like `/klyna-feed/google/?token=…`. The token is a shared secret stored in settings so the feed is not guessable. You can rotate it from the Settings page if a URL ever leaks.

= How often does the feed refresh? =

On the schedule you pick in Settings (hourly, twice daily, daily, or manual only), driven by WP-Cron. The public URL always serves the most recent cached copy, so it responds instantly.

= How do I set a product's GTIN or brand? =

Store them in product meta. By default the plugin reads `_gtin` and `_brand`, but you can change the meta keys in Settings. There is also a per-product override for condition (`_condition`) and Google category (`_google_product_category`).

= Where is my data stored? =

Only in your WordPress database — the plugin settings plus a small cache table holding the last generated feed for each format. We never collect anything.

== Screenshots ==

1. The dashboard with per-feed stats and copy-ready public feed URLs.
2. The feed health scanner listing products missing required fields.
3. The settings page — formats, schedule, field mapping, and category filters.

== Changelog ==

= 0.1.0 =
* Initial release.
* Google Shopping XML feed generation (RSS 2.0 + `g:` namespace).
* Meta product CSV feed generation.
* Field mapping for gtin, brand, condition, google_product_category, mpn.
* Include/exclude by product category and in-stock-only filtering.
* Variable-product variations exported with item_group_id grouping.
* Scheduled regeneration via WP-Cron with token-protected public feed URLs.
* Feed health scanner for missing required fields.
* Admin dashboard, feed health page, and settings page. REST control endpoints.

== Upgrade Notice ==

= 0.1.0 =
First public release.
