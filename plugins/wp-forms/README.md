# Klyna Forms

> Tools that help your work get found. Lead-gen forms with entry storage, spam protection & notifications.

Klyna Forms is the forms half of the [Klyna](https://klyna.dev) toolkit — a focused, open WordPress plugin that lets you build a form, embed it anywhere, and collect leads without paying for the basics. Every submission is stored, spam-filtered, and emailed to you. No external services, no API keys, no upsell wall.

Part of the Klyna family of products. It runs alongside Klyna SEO Suite and the other Klyna plugins — namespaces and option keys are isolated so nothing collides.

---

## Features

- **Visual form builder.** Add `text`, `email`, `tel`, `url`, `number`, `textarea`, `select`, `radio`, and `checkbox` fields. Drag rows to reorder, mark fields required, and add options for choice fields. Backed by a `klyna_form` custom post type with field definitions in post meta.
- **Shortcode + Gutenberg block.** Embed with `[klyna_form id="123"]` or the server-rendered **Klyna Form** block (pick the form from a dropdown).
- **REST submission.** Front-end posts to `POST /klyna-forms/v1/submit` with a per-form nonce. Inline, per-field validation; progressive enhancement means the form still works without JS reloads.
- **Entry storage.** Submissions land in a dedicated `{prefix}_klyna_form_entries` table (created via `dbDelta`). Browse them in the admin with unread badges, mark read/unread, delete, and paginate.
- **CSV export.** One click streams a spreadsheet-ready CSV of a form's entries (fixed columns + one per field).
- **Spam protection.** A hidden **honeypot** field plus a configurable **time-trap** that rejects bot-speed submissions. Both server-side, no CAPTCHA, no third-party calls. Spam hits return a fake success so bots stop retrying.
- **Email notifications.** Admin email on every submission with the submitter's email as `Reply-To`. Global recipient with per-form override, customizable subject (`{form_title}` token), and From name/email.
- **After-submit control.** Show an inline success message or redirect to any URL.
- **Privacy-first.** Nothing leaves your server. IP storage is opt-out.

## File layout

```
wp-forms/
├── wp-forms.php                  # main file: header, constants, autoloader, bootstrap, activation
├── uninstall.php                 # removes option, table, form posts on delete
├── includes/
│   ├── class-plugin.php          # orchestrator — boots subsystems on plugins_loaded
│   ├── class-forms.php           # form model: CPT + field/config meta (sanitized)
│   ├── class-entries.php         # custom entries table (dbDelta) + query/insert/export helpers
│   ├── class-render.php          # shortcode + block + front-end form HTML (+ honeypot/time-trap)
│   ├── class-submission.php      # REST submit: validate → spam-gate → store → notify
│   └── class-admin.php           # forms list, builder, entries viewer, CSV export, settings
├── assets/
│   ├── logo.svg                  # product logo (Klyna gradient square + clipboard glyph)
│   ├── admin/{admin.css,admin.js}# Klyna dark/violet admin UI + builder interactions
│   ├── css/forms.css             # front-end form styles (theme-friendly, violet accent)
│   └── js/{forms.js,block.js}    # vanilla submit handler + Gutenberg block (no jQuery)
├── languages/wp-forms.pot        # translation template
├── readme.txt                    # WordPress.org readme
├── README.md                     # this file
└── LISTING.md                    # marketplace listing copy + keywords
```

## Architecture notes

- **PHP namespace:** `KlynaForms\*`, autoloaded from `includes/class-*.php` by the `spl_autoload_register` shim in the main file (mirrors the Klyna SEO Suite autoloader, with the `KlynaForms\` prefix check).
- **Constants:** `KLYNA_FORMS_VERSION`, `KLYNA_FORMS_PLUGIN_FILE/DIR/URL`, `KLYNA_FORMS_OPTION_KEY` (`wp_forms_settings`), `KLYNA_FORMS_POST_TYPE` (`klyna_form`), `KLYNA_FORMS_DB_VERSION`.
- **Settings option:** `wp_forms_settings` — one associative array, defaults applied on read via `Plugin::settings()` / `Plugin::setting()`.
- **REST namespace:** `klyna-forms/v1`. The submit route is intentionally public (visitors submit); protection is the nonce + honeypot + time-trap, not a capability check. All admin writes go through nonce-checked, capability-gated `admin_post`-style handlers in `Admin::handle_post_actions()`.
- **Coexistence:** distinct namespace (`KlynaForms\` vs `Klyna\`), constant prefix (`KLYNA_FORMS_` vs `KLYNA_`), option key, text domain (`wp-forms`), CPT, table name, and REST namespace — so it never collides with Klyna SEO Suite or the sibling plugins.

## Security

- Every admin write checks a nonce (`check_admin_referer`) and `current_user_can( 'manage_options' )`.
- The REST submit verifies a form-bound nonce (`klyna_form_submit_{id}`).
- All input is sanitized (`sanitize_text_field`, `sanitize_email`, `esc_url_raw`, `sanitize_textarea_field`, type-aware in `Submission::sanitize_value()`); all output is escaped (`esc_html`, `esc_attr`, `esc_url`, `wp_kses_post`).
- DB access uses `$wpdb->prepare()` for every interpolated query; the entries table is created with `dbDelta`.
- Defense-in-depth: field/config values are re-sanitized in `Forms::normalize_field()` / `Forms::save_config()` on the way in, regardless of caller.

## Extending

```php
// React to accepted submissions (e.g. push to a CRM).
add_action( 'klyna_forms_submission', function ( $form_id, $values, $entry_id ) {
	// $values is keyed by field key, already sanitized.
}, 10, 3 );
```

## Development

This is a self-contained plugin — no build step, no Composer, no npm. The
admin and front-end scripts are hand-written vanilla JS that ship as-is.

```bash
# From a WordPress install:
cp -r wp-forms /path/to/wp-content/plugins/
# Activate "Klyna Forms" in wp-admin → Plugins.
```

To regenerate the translation template after editing strings, run WP-CLI's
`wp i18n make-pot . languages/wp-forms.pot` from the plugin directory.

## STATUS — honest state of the plugin

**Working and complete (v0.1.0):**

- ✅ Form builder CPT + meta model, with full sanitize-on-save.
- ✅ Drag-to-reorder, add/remove fields, options + required toggles in the builder UI.
- ✅ Shortcode and Gutenberg block, both rendering through one server-side renderer.
- ✅ REST submit endpoint with form-bound nonce, per-field validation, and inline error display.
- ✅ Honeypot + time-trap spam protection (both server-enforced, configurable).
- ✅ Entry storage in a custom table, admin viewer with unread badges + pagination, read/unread/delete, and CSV export.
- ✅ Email notifications with Reply-To, per-form recipient override, `{form_title}` subject token.
- ✅ Success message or redirect after submit.
- ✅ Clean uninstall (option, DB version, form posts, entries table).
- ✅ Full i18n coverage with a `.pot` template.

**Intentionally minimal / not yet built:**

- ⛔ No file-upload field type (storage + validation surface deliberately deferred).
- ⛔ No conditional logic / multi-step forms.
- ⛔ No built-in CAPTCHA or third-party spam service (by design — honeypot + time-trap only).
- ⛔ The Gutenberg block lists forms via the REST `klyna_form` collection; it is functional but unstyled beyond the core `Placeholder`.
- ⛔ No automated PHPUnit suite in this package yet; logic is written to be unit-testable (pure helpers in `Forms`, `Entries`, `Submission`).
- ⛔ No CSV *import* — export only.
- ⛔ Notifications use `wp_mail()` only; no SMTP config UI (relies on the site's mailer).

Everything described under "Working and complete" is real, wired, and runnable
once the plugin is activated on WordPress 6.4+ / PHP 8.0+.

## License

GPL-2.0-or-later. Built by [Klyna](https://klyna.dev).
