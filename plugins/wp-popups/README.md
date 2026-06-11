# Klyna Popups

> Email-capture popups, exit-intent triggers, and targeted on-site offers.
> Tools that help your work get found.

Klyna Popups is the on-site conversion plugin in the [Klyna](https://klyna.dev)
toolkit. It builds email-capture popups and targeted offers that run entirely on
your own server — no monthly SaaS, no third-party API keys, no data leaving your
site.

It coexists cleanly with the other Klyna plugins: it has its own PHP namespace
(`KlynaPopups\`), constant prefix (`KLYNA_POPUPS_*`), option key
(`wp_popups_settings`), REST namespace (`klyna-popups/v1`), and text domain
(`wp-popups`).

## Features

- **Popup builder on the post editor.** Each popup is a `klyna_popup` post:
  title + rich body in the editor, design / trigger / display-rule controls in a
  settings meta box.
- **Five layouts** — center modal, top slide-in, bottom slide-in, bottom-right
  corner, full-width bar — in a dark or light theme with fade / slide / none
  animations.
- **Four triggers** — time delay, scroll depth, exit intent, and click of any
  CSS-selected element.
- **Display rules** — path globs (include + exclude with `*` wildcards), device
  (desktop / mobile), new vs returning visitors, and a frequency cap (every
  view, once per session, once ever, once every N days).
- **Email capture** stored in a dedicated table (`{prefix}klyna_popup_entries`)
  with a unique `(popup_id, email)` key, plus one-click **CSV export**.
- **Signed webhook** — each capture is POSTed as JSON (`event: popup.capture`)
  with an optional `X-Klyna-Signature: sha256=…` HMAC of the body. Non-blocking.
- **Impression + conversion counters** per popup, with a live conversion rate in
  the editor and the list table.
- **Privacy** — visitor IPs are one-way hashed (never stored raw), and the
  plugin can honor the browser Do Not Track signal.

## Architecture

```
wp-popups/
├── wp-popups.php              # Header, constants, autoloader, activation/deactivation
├── uninstall.php              # Removes option, popup posts + meta, entries table
├── includes/
│   ├── class-plugin.php       # Orchestrator — boots subsystems on plugins_loaded
│   ├── class-popups.php       # CPT + per-popup config meta + editor meta box
│   ├── class-entries.php      # Entries table (dbDelta), counters, webhook dispatch
│   ├── class-rest.php         # REST routes (public capture/impression, admin entries)
│   ├── class-frontend.php     # Eligibility rules + asset enqueue + payload injection
│   └── class-admin.php        # Menu, dashboard, entries inbox, CSV export, settings
├── assets/
│   ├── admin/admin.css        # Admin UI (Klyna violet accent)
│   ├── admin/admin.js         # Trigger / frequency field toggling
│   ├── css/popup.css          # Front-end popup styles (dark + light themes)
│   ├── js/popup.js            # Front-end engine (vanilla, no jQuery)
│   └── logo.svg               # Product mark (overlapping window glyph)
├── languages/wp-popups.pot
├── readme.txt                 # WordPress.org listing
├── README.md                  # This file
└── LISTING.md                 # Store listing copy + keywords
```

The class autoloader mirrors the Klyna SEO Suite: `KlynaPopups\Foo` resolves to
`includes/class-foo.php` (camelCase split on capitals).

### Server vs client rule split

To stay correct under full-page caching, eligibility is split:

- **Server (`Frontend`)** — decides path and device rules. Only popups that pass
  are ever emitted into the page, so a cached page never leaks a popup that
  shouldn't run on it.
- **Client (`popup.js`)** — enforces frequency cap and new-vs-returning using
  cookies / `sessionStorage`, which can't be cached.

### Data flow

1. `Frontend::enqueue()` runs a `WP_Query` for active, published popups, filters
   by server-side rules, and injects the surviving payloads on
   `window.KlynaPopups`.
2. `popup.js` evaluates client-side rules, arms the chosen trigger, and on fire
   renders the popup, POSTs `/impression`, and (on submit) POSTs `/capture`.
3. `Rest::capture()` validates the nonce, sanitizes the email, stores the entry
   via `Entries::record_capture()`, bumps the conversion counter, and fires the
   webhook.

### Security

- Every front-end write requires a valid `wp_rest` nonce (`X-WP-Nonce`).
- Admin reads/exports require `manage_options`; CSV export also checks a
  dedicated nonce.
- Meta-box saves check `edit_post` + a config nonce.
- All input is sanitized (`Popups::sanitize_config`, `Admin::sanitize_settings`,
  REST `sanitize_*`); all output is escaped; the popup body is `wp_kses_post`'d.
- IPs are hashed with `AUTH_SALT`; raw IPs are never persisted.

## Development

No build step — the front end and admin scripts are hand-written vanilla JS.

```bash
# From a WordPress install, symlink or copy into wp-content/plugins/
ln -s "$(pwd)" /path/to/wp-content/plugins/wp-popups

# Then activate via WP-CLI:
wp plugin activate wp-popups
```

Regenerate the translation template (optional, requires WP-CLI i18n command):

```bash
wp i18n make-pot . languages/wp-popups.pot --slug=wp-popups
```

### Webhook payload

```json
{
  "event": "popup.capture",
  "popup_id": 42,
  "popup_title": "Spring sale",
  "email": "person@example.com",
  "name": "",
  "page_url": "https://site.test/pricing",
  "site": "https://site.test/",
  "created_at": "2026-06-11 12:00:00"
}
```

Verify the signature (Node):

```js
const sig = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
// constant-time compare sig against the X-Klyna-Signature header
```

## STATUS — honest state

**Working / production-grade**

- ✅ Popup CPT, config meta box, sanitization, and list-table columns.
- ✅ Entries table via `dbDelta` with idempotent upgrade check; counters are
  incremented with an atomic SQL `UPDATE` (no read-modify-write race).
- ✅ REST capture / impression (nonce-gated) + admin entries (cap-gated).
- ✅ Front-end engine: all four triggers, five layouts, both themes, animations,
  frequency cap, new-vs-returning, DNT, accessible dialog (focus + Escape).
- ✅ Signed, non-blocking webhook dispatch.
- ✅ CSV export, settings page, clean uninstall.

**Intentionally minimal in 0.1.0**

- The popup body uses the classic editor meta box; a dedicated Gutenberg block /
  full-screen builder is not included yet.
- No A/B testing or scheduling (start/end dates) yet — popups are simply
  active/paused.
- Webhook delivery is fire-and-forget (non-blocking); there is no retry queue or
  delivery log. Failed sends are silently dropped by design so they never affect
  the visitor.
- Email capture stores and forwards; it does not send the email itself (no SMTP)
  — pair the webhook with your ESP/automation.
- No built-in spam mitigation beyond email validation and the per-popup unique
  email key; add a honeypot/CAPTCHA layer for high-traffic public sites.

**Not yet tested in CI** — this is a fresh 0.1.0 scaffold. The PHP is written to
WordPress coding standards and is structurally ready to run, but it has not yet
been exercised against a live WordPress install in this worktree.

## License

GPL-2.0-or-later. © Klyna.
