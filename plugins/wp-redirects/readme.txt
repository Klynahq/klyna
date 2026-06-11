=== Klyna Redirects ===
Contributors: klyna
Tags: redirects, 301 redirect, 404 monitor, redirect manager, SEO redirects
Requires at least: 6.4
Tested up to: 6.7
Stable tag: 0.1.0
Requires PHP: 8.0
License: GPL-2.0-or-later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

301/302/307/410 redirect manager with a 404 monitor and one-click auto-redirects. Built for SEO by Klyna.

== Description ==

**Klyna Redirects** is a clean, no-bloat redirect manager for WordPress. Manage 301/302/307/410 redirects with a simple admin UI, monitor every 404 hit with one-click "create redirect from 404," and automatically create 301s when a post slug changes.

**Key features:**

* **Redirect manager** — Add, edit, delete rules (exact or regex). Tracks hit counts per redirect.
* **301/302/307/410 support** — Choose the right status code per redirect. 410 Gone for permanently removed content.
* **Regex support** — Match URL patterns and use capture groups in the destination.
* **404 monitor** — Logs every 404 hit with URL, referrer, and hit count. Prunes old entries automatically.
* **One-click redirect from 404** — In the monitor, enter a destination URL and create a 301 instantly.
* **Auto-redirect on slug change** — When a published post slug changes, a 301 is created automatically.
* **CSV import/export** — (roadmap) bulk manage redirects.
* **No jQuery** — Clean, modern JavaScript only where needed.
* **No external services** — All data in your own database.

== Installation ==

1. Upload the `wp-redirects` folder to `/wp-content/plugins/`.
2. Activate the plugin.
3. Go to **Redirects** in the WordPress admin menu.
4. Add your first redirect or check the 404 Monitor tab.

== Frequently Asked Questions ==

= Will it conflict with Yoast/RankMath redirects? =
You can run both, but only one should fire redirects — disable the redirect module in your SEO plugin to avoid conflicts.

= Does it support multisite? =
Single-site tested. Multisite support is on the roadmap.

= Is there a redirect limit? =
No artificial limit. Performance scales with your database — the source column is indexed.

== Changelog ==

= 0.1.0 =
* Initial release — redirect manager, regex support, 404 monitor, auto slug-change redirects.
