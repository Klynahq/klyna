=== Klyna Analytics ===
Contributors: klyna
Tags: analytics, privacy, cookieless, gdpr, statistics
Requires at least: 6.4
Tested up to: 6.7
Requires PHP: 8.0
Stable tag: 0.1.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Privacy-first, cookieless analytics with an in-dashboard report. No cookies, no external services, no personal data. Respects Do-Not-Track.

== Description ==

**Klyna Analytics** is a privacy-first, cookieless analytics plugin from [Klyna](https://klyna.dev), an indie studio. It gives you the numbers that matter — pageviews, unique visitors, top pages, top referrers, traffic over time, and custom events — without cookies, without a third-party SaaS, and without storing a single piece of personal data.

Everything runs on **your** server. No data ever leaves your WordPress install.

= What it does =

* **Cookieless pageview tracking** via a tiny (~1 KB) front-end beacon that posts to a local REST endpoint. No cookies, no localStorage, no fingerprinting.
* **Custom event tracking** — call `wpAnalytics('signup')` from your theme or a block to count conversions, downloads, or clicks.
* **Daily aggregation** into a single compact custom table. The plugin stores counters, never a row per visit, so it stays fast and tiny even on busy sites.
* **In-dashboard report** — headline totals, top pages, top referrers, custom events, and a views-over-time chart drawn on a canvas (no chart library, no external scripts).
* **Privacy by design** — respects Do-Not-Track and the Global Privacy Control, excludes admins and logged-in users by default, and stores zero PII.

= Privacy first =

Klyna Analytics is built so you can be honest with your visitors:

* No cookies are ever set.
* No IP address, user agent, or visitor identifier is stored. Unique-visitor counts come from a salted, daily-rotating hash that is computed in memory and immediately discarded.
* No data is sent to any third party. There are no external requests at all.
* Do-Not-Track and Global Privacy Control signals opt a visitor out entirely.
* Data retention is configurable; old aggregates are pruned automatically.

= Why we built it =

Most analytics either cost money, ship your visitors' data to someone else, or bury you in a consent banner. Klyna Analytics is the opposite: free, local, and quiet. It answers "what's working on my site" without a single dark pattern.

== Installation ==

1. Upload the `wp-analytics` folder to `/wp-content/plugins/`.
2. Activate **Klyna Analytics** from **Plugins** in the WordPress admin.
3. Visit **Analytics** in the admin menu to see your dashboard.
4. (Optional) Visit **Analytics → Settings** to tune Do-Not-Track behavior, logged-in tracking, and retention.

Tracking starts immediately after activation — no snippet to paste, no account to create.

== Frequently Asked Questions ==

= Does it use cookies? =

No. Klyna Analytics never sets a cookie and never touches localStorage. That means you generally do not need a cookie-consent banner for it (check your local regulations).

= Does it store IP addresses or any personal data? =

No. The collector derives a one-way, salted, daily-rotating hash from the request purely to decide whether a hit is a returning visitor for that day, then discards it. The hash is never written to the database. Only aggregated daily counters (day, path, referrer host, event, counts) are stored.

= Does it call any external services? =

No. Every request stays on your own server. There are zero outbound network calls.

= Does it respect Do-Not-Track? =

Yes, by default. If a visitor sends a Do-Not-Track or Global Privacy Control signal, they are not tracked at all. You can disable this in Settings if you prefer, but we recommend leaving it on.

= How do I track a custom event? =

Call the global helper from anywhere on your front end:

`wpAnalytics( 'newsletter_signup' );`

Event names are lowercase slugs. The event name is the only thing stored.

= Will it slow down my site? =

No. The beacon is loaded asynchronously and fired with `navigator.sendBeacon`, so it never blocks rendering. Storage is a single indexed counter table, and the report queries run only in the admin.

= Where is my data stored? =

In one custom table (`wp_klyna_analytics_daily`) in your own WordPress database. Deleting the plugin removes it cleanly.

== Screenshots ==

1. The analytics dashboard — totals, views-over-time chart, top pages, and referrers.
2. Top pages and referrers with inline bars.
3. The privacy-focused settings page.

== Changelog ==

= 0.1.0 =
* Initial release.
* Cookieless pageview + custom-event tracking via a local REST beacon.
* Daily aggregation into a custom table (dbDelta), with automatic pruning.
* Admin dashboard: totals, top pages, top referrers, custom events, and a canvas views-over-time chart with an SVG sparkline fallback.
* Respects Do-Not-Track and Global Privacy Control. No cookies, no PII, no external services.

== Upgrade Notice ==

= 0.1.0 =
First public release.
