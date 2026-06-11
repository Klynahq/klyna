=== Klyna Reviews ===
Contributors: klyna
Tags: reviews, ratings, star ratings, rich snippets, schema, WooCommerce, UGC
Requires at least: 6.4
Tested up to: 6.7
Stable tag: 0.1.0
Requires PHP: 8.0
License: GPL-2.0-or-later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Collect and display customer reviews with rich-snippet star ratings, moderation, and automatic JSON-LD schema — built by Klyna.

== Description ==

**Klyna Reviews** lets your WordPress site collect verified customer reviews, display them with beautiful star ratings, and automatically inject `AggregateRating` + `Review` JSON-LD so Google shows rich-snippet stars in search results.

**Key features:**

* **Review submission form** — display via shortcode `[klyna_reviews]` or Gutenberg block on any post/page.
* **Star ratings** — 1–5 stars stored per review with aggregate calculation.
* **Moderation queue** — reviews go to "pending" by default; approve/reject from the WordPress admin.
* **Rich snippets** — automatic `AggregateRating` and `Review` JSON-LD schema injected on pages with reviews.
* **Review-request email** — optional email trigger to ask for a review after a set delay.
* **Spam protection** — honeypot field on every form.
* **No external services** — all data stays on your server; no paid APIs required.
* **Klyna brand-safe** — clean admin UI matching the Klyna design system (violet/zinc).

== Installation ==

1. Upload the `wp-reviews` folder to `/wp-content/plugins/`.
2. Activate the plugin in **Plugins > Installed Plugins**.
3. Go to **Settings > Klyna Reviews** to configure defaults.
4. Add `[klyna_reviews]` to any post or page to show the review form and listing.

== Frequently Asked Questions ==

= Does it work with WooCommerce? =
It works as a standalone review system on any post type. Native WooCommerce product-review integration is on the roadmap.

= Can I display reviews on any post type? =
Yes — the shortcode works everywhere. You can target specific post types in the settings.

= Where is the data stored? =
Reviews are stored as a custom post type (`klyna_review`) with rating stored as post meta. Nothing leaves your server.

== Changelog ==

= 0.1.0 =
* Initial release — review CPT, moderation, star display, aggregate JSON-LD, shortcode, spam guard.
