=== Klyna Forms ===
Contributors: klyna
Tags: forms, contact form, lead generation, form builder, spam protection
Requires at least: 6.4
Tested up to: 6.7
Requires PHP: 8.0
Stable tag: 0.1.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Lead-gen forms with entry storage, spam protection & notifications. Build a form, drop a shortcode, collect leads. No paid APIs.

== Description ==

**Klyna Forms** is a focused, no-nonsense form plugin from [Klyna](https://klyna.dev), an indie studio. Build a form in the visual builder, embed it with a shortcode or block, and every submission is stored, spam-filtered, and emailed to you.

No external services. No account. No upsell wall in front of the features you actually need.

= What it does =

* **Visual form builder** — add text, email, phone, URL, number, paragraph, dropdown, radio, and checkbox fields. Drag to reorder. Mark fields required.
* **Shortcode + Gutenberg block** — embed any form with `[klyna_form id="123"]` or the **Klyna Form** block.
* **Entry storage** — every submission is saved to a dedicated database table and viewable in the admin, with unread badges.
* **CSV export** — download all entries for a form as a spreadsheet-ready CSV in one click.
* **Spam protection** — a hidden honeypot field plus a time-trap that rejects bot-speed submissions. No CAPTCHA, no third-party calls.
* **Email notifications** — get an email on every submission, with the submitter's email set as the Reply-To. Per-form recipient overrides supported.
* **Success message or redirect** — show an inline thank-you message or send visitors to any URL after submit.

= Privacy-first =

Everything runs on your own server. Klyna Forms never phones home, requires no API key, and stores data only in your WordPress database. IP storage is opt-out.

= Why we built it =

Most form plugins bury storage, spam protection, and notifications behind a paid tier. Klyna Forms ships them in the free, open plugin — because a contact form collecting leads shouldn't be a premium feature.

== Installation ==

1. Upload the `wp-forms` folder to `/wp-content/plugins/`.
2. Activate the plugin from **Plugins** in the WordPress admin.
3. Go to **Klyna Forms → Add form**, build your form, and save.
4. Copy the shortcode (e.g. `[klyna_form id="12"]`) onto any page or post, or insert the **Klyna Form** block.
5. Configure global notification and spam settings under **Klyna Forms → Settings**.

== Frequently Asked Questions ==

= Does it call any external services? =

No. Form rendering, spam filtering, storage, and notifications are all handled in pure PHP on your own server. No API keys, no SaaS, no data leaves your site.

= How does spam protection work without a CAPTCHA? =

Two layers. A **honeypot** field is hidden from humans but visible to bots — any submission that fills it is silently dropped. A **time-trap** rejects submissions that arrive faster than a person could realistically complete the form (configurable, default 3 seconds). Both run server-side.

= Where are submissions stored? =

In a dedicated table (`{prefix}_klyna_form_entries`) in your WordPress database. You can browse them under **Klyna Forms → Entries** and export any form's entries to CSV.

= Can I send notifications to more than one address? =

Yes. Set a comma-separated list of recipients globally in Settings, or override it per form in the form editor.

= Does it work with the block editor? =

Yes. Insert the **Klyna Form** block and pick your form from the dropdown. The block is server-rendered, so it always reflects the latest field configuration.

= Will it slow down my site? =

No. Front-end CSS and JS are only enqueued on pages that actually contain a form, and the script is plain vanilla JavaScript with no jQuery dependency.

= What happens to my data if I uninstall? =

Deleting the plugin removes its settings, all form definitions, and the entries table. Deactivating (without deleting) preserves everything.

== Screenshots ==

1. The form builder — add fields, reorder by drag, configure notifications and the after-submit action.
2. The entries viewer with unread badges and one-click CSV export.
3. The settings page — notifications, spam protection, and storage controls.
4. A rendered form on the front end with the Klyna accent.

== Changelog ==

= 0.1.0 =
* Initial release.
* Visual form builder backed by a custom post type + meta.
* Shortcode `[klyna_form]` and server-rendered `klyna/form` Gutenberg block.
* REST submission endpoint with nonce protection and inline validation.
* Honeypot + time-trap spam protection.
* Entry storage in a custom table, admin viewer, and CSV export.
* Admin email notifications with per-form recipient overrides.
* Success message or redirect after submit.

== Upgrade Notice ==

= 0.1.0 =
First public release.
