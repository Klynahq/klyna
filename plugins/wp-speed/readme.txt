=== Klyna Speed ===
Contributors: klyna
Tags: performance, cache, page-cache, lazy-load, core-web-vitals
Requires at least: 6.4
Tested up to: 6.7
Requires PHP: 8.0
Stable tag: 0.1.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Performance & Core Web Vitals for WordPress — full-page disk cache, lazy-load, defer JS, CSS & HTML minify, preload, and Heartbeat control. No paid APIs.

== Description ==

**Klyna Speed** is the performance plugin in the Klyna toolkit — an indie, open plugin that handles the Core Web Vitals basics without a SaaS subscription, a CDN account, or a single external API call. Everything runs on your own server.

Built by [Klyna](https://klyna.dev), an indie studio. Tools that help your work get found.

= What it does =

* **Full-page disk cache** — renders each page once, stores the HTML on disk, and serves it statically on the next visit. PHP, the database, and your theme are skipped entirely for cache hits.
* **Smart invalidation** — saving or deleting a post, approving a comment, switching themes, editing a menu, or saving settings clears exactly the pages that changed (and the home/archive pages that reference them).
* **Image & iframe lazy-load** — adds `loading="lazy"` and `decoding="async"` to off-screen media. The first image on the page is always left eager so your LCP element loads immediately.
* **Defer JavaScript** — adds `defer` to non-critical external scripts so they stop blocking the first paint. jQuery core and i18n scripts are left untouched.
* **CSS & HTML minify** — strips comments and collapses whitespace in your local stylesheets (cached to disk) and in the page HTML, while preserving `<pre>`, `<textarea>`, `<script>`, and `<style>` blocks.
* **Preload key assets** — emits `<link rel="preload">` hints for the fonts, hero images, and scripts you list. Fonts get `crossorigin` automatically.
* **Heartbeat control** — slow, restrict, or fully disable the WordPress Heartbeat API to cut admin-ajax CPU on busy dashboards.
* **One-click purge** — clear the whole cache from the dashboard, the settings page, or the front-end admin bar.

= Why we built it =

Most performance plugins bolt on a paid CDN, a paid image service, or a "cloud" optimizer. We wanted a plugin that does the unglamorous, high-impact basics — cache, defer, lazy-load, minify — entirely on your server, for free, and stays out of the way.

= Privacy =

Klyna Speed makes **no external requests**. It stores cached pages on your disk under `wp-content/cache/klyna-speed` and its settings in your WordPress database. Nothing is collected, nothing leaves your site.

== Installation ==

1. Upload the `wp-speed` folder to `/wp-content/plugins/`.
2. Activate the plugin from **Plugins** in the WordPress admin.
3. Visit **Klyna Speed** in the admin menu to see your cache dashboard.
4. Open **Klyna Speed → Settings** to toggle each optimization and add any paths to exclude (cart, checkout, account areas).

The cache turns on automatically with sensible defaults. There is nothing else to configure to get going.

== Frequently Asked Questions ==

= Does it call any external services? =

No. Caching, minification, lazy-load, and defer are all computed on your own server with pure PHP. No API keys, no CDN account, no third-party requests.

= Will it conflict with another cache plugin? =

Run only one full-page cache at a time. If you already use WP Super Cache, W3 Total Cache, or a host-level cache, either disable Klyna Speed's page cache (Settings → Page cache) and use only its optimization features, or disable the other cache. The optimization features (lazy-load, defer, minify) are generally safe to run alongside a host cache.

= How is the cache invalidated? =

Automatically. Publishing or updating a post purges that post's URL plus the home page, blog index, and any category/tag archives it belongs to. Approving or editing a comment purges its post. Switching themes, editing a nav menu, running the Customizer, or saving the plugin settings purges everything. You can also purge manually any time.

= What is never cached? =

Admin pages, REST/AJAX/cron requests, POST requests, anything with a query string, logged-in users (unless you opt in), search results, feeds, previews, password-protected pages, and any path you add to the exclusion list.

= Does lazy-load hurt my Largest Contentful Paint? =

No — the first image on each page is deliberately left eager (no `loading="lazy"`), so your LCP candidate is never deferred. You can also add `data-no-lazy` or a `skip-lazy` class to opt any image out.

= Will deferring scripts break my site? =

Klyna Speed only defers external scripts with a `src`, never inline scripts, modules, or already-deferred/async tags, and it skips jQuery core, jQuery Migrate, and the WordPress i18n/hooks scripts. If a specific script misbehaves, add `data-no-defer` to its tag.

= Where is my data stored? =

Cached pages live on disk in `wp-content/cache/klyna-speed`. Settings live in the `wp_speed_settings` option in your database. Deleting the plugin removes both.

== Screenshots ==

1. The cache dashboard — page count, disk usage, feature status, and one-click purge.
2. The settings page with page-cache, optimization, preload, and Heartbeat controls.
3. The front-end admin bar "Purge Klyna cache" shortcut.

== Changelog ==

= 0.1.0 =
* Initial release.
* Full-page disk cache with smart, save-driven invalidation.
* Image and iframe lazy-load (LCP-safe).
* Defer non-critical JavaScript with a safe denylist.
* Local CSS minification (cached to disk) and HTML minification.
* Preload hints for user-specified key assets.
* Heartbeat control (default / slow / editor-only / off).
* REST endpoints for cache stats and one-click purge, plus an admin-bar shortcut.

== Upgrade Notice ==

= 0.1.0 =
First public release.
