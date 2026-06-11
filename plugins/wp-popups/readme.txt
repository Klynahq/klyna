=== Klyna Popups ===
Contributors: klyna
Tags: popup, email-capture, exit-intent, optin, lead-generation
Requires at least: 6.4
Tested up to: 6.7
Requires PHP: 8.0
Stable tag: 0.1.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Email-capture popups, exit-intent triggers, and targeted on-site offers. Local, open, and free — no paid APIs and no data leaving your site.

== Description ==

**Klyna Popups** is the on-site conversion half of the Klyna toolkit — an indie plugin for building email-capture popups, exit-intent offers, and targeted on-site campaigns without a monthly SaaS bill.

Built by [Klyna](https://klyna.dev), an indie studio. Tools that help your work get found.

= What it does =

* Build unlimited popups from a familiar **post editor** — title, rich body, and a design panel.
* Five layouts: **center modal**, top / bottom slide-in, bottom-right corner, and a full-width bar.
* Four triggers: **time delay**, **scroll depth**, **exit intent**, and **click of any element**.
* Targeted display rules: **path globs**, **device** (desktop / mobile), **new vs returning** visitors, and a **frequency cap** (every view, once per session, once ever, or once every N days).
* **Email capture** stored in a dedicated table on your own server, with one-click **CSV export**.
* Optional **signed webhook** — each capture is POSTed as JSON with an HMAC signature so your CRM or automation can verify it.
* Per-popup **impression and conversion counters** with a live conversion rate.

= Privacy first =

Everything runs on your server. No third-party APIs, no API keys, no tracking pixels. Visitor IPs are one-way hashed (never stored raw), and the plugin can honor the browser **Do Not Track** signal.

= Why we built it =

Most popup plugins upsell you into a dashboard you rent forever. We wanted one that does the work — stores your emails where you control them, forwards them where you want, and stays out of the way.

== Installation ==

1. Upload the `wp-popups` folder to `/wp-content/plugins/`.
2. Activate the plugin from **Plugins** in the WordPress admin.
3. Go to **Klyna Popups → Add popup**, write your offer, choose a trigger and display rules, and publish.
4. (Optional) Visit **Klyna Popups → Settings** to add a webhook URL and signing secret.
5. View captures any time under **Klyna Popups → Entries**, or export them to CSV.

== Frequently Asked Questions ==

= Does it call any external services? =

No. Popups render from your own server, captures are stored in your own database, and the only outbound request is the optional webhook you configure yourself.

= Does it work with page caching? =

Yes. Server-evaluable rules (path, device) are decided in PHP, while per-visitor rules (frequency cap, new vs returning) run in the browser using cookies — so a cached page still shows the right popup to the right visitor.

= Where are captured emails stored? =

In a dedicated table (`{prefix}klyna_popup_entries`) in your WordPress database. Nothing leaves your site unless you set up a webhook.

= How does the webhook signature work? =

If you set a signing secret, every webhook request includes an `X-Klyna-Signature: sha256=…` header — an HMAC-SHA256 of the JSON body. Your receiver recomputes the HMAC with the same secret to verify authenticity.

= Will it slow down my site? =

No. The front-end bundle is tiny vanilla JavaScript (no jQuery), only loaded on pages with an eligible popup. Webhook dispatch is non-blocking.

= Does it respect Do Not Track? =

Yes, when enabled in Settings. With Do Not Track on, no popup is shown and no impression is recorded for visitors signalling DNT.

== Screenshots ==

1. The dashboard with live popup count, total captures, and quick actions.
2. The popup editor — body in the editor, triggers and display rules in the settings panel.
3. The entries inbox with CSV export.
4. The settings page (webhook, frequency, privacy).

== Changelog ==

= 0.1.0 =
* Initial release.
* Popup custom post type with design, trigger, and display-rule controls.
* Triggers: time delay, scroll depth, exit intent, click.
* Display rules: path globs, device, new vs returning, frequency cap.
* Email capture stored in a dedicated table with CSV export.
* Optional HMAC-signed webhook on capture.
* Per-popup impression and conversion counters.

== Upgrade Notice ==

= 0.1.0 =
First public release.
