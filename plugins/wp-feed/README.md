# Klyna Product Feed (WordPress plugin)

WooCommerce product feeds for Google Shopping & Meta, auto-refreshed.
Field mapping, category/stock filters, scheduled regeneration, and feed
health warnings. Free, open, no paid APIs.

Part of the [Klyna](https://klyna.dev) toolkit — _tools that help your work
get found._

## What it does

- **Google Shopping XML** — RSS 2.0 feed with the `g:` namespace, ready for
  Google Merchant Center.
- **Meta product CSV** — the column layout Meta Commerce Manager expects.
- **Field mapping** — `gtin`, `brand`, `condition`, `google_product_category`,
  `mpn`, and `item_group_id`, each sourced from a configurable product meta key
  with a sitewide default fallback.
- **Catalog filters** — include only certain product categories, exclude
  others, and optionally restrict to in-stock items.
- **Scheduled regeneration** — WP-Cron rebuilds the cached feeds hourly / twice
  daily / daily; the public URL serves the latest cached copy instantly.
- **Token-protected public URLs** — `/klyna-feed/google/?token=…` and
  `/klyna-feed/meta/?token=…`, safe to paste into Google/Meta.
- **Feed health scanner** — flags products missing required fields before you
  submit, so feeds don't get disapproved.
- **Variable products** — exported as individual variations grouped with
  `item_group_id`.

## Coexistence with other Klyna plugins

This plugin is intentionally namespaced so it can run side-by-side with the
Klyna SEO Suite and the other Klyna products:

| Concern        | Value                 |
| -------------- | --------------------- |
| PHP namespace  | `KlynaFeed\*`         |
| Constants      | `KLYNA_FEED_*`        |
| Option key     | `wp_feed_settings`    |
| Cache table    | `{prefix}klyna_feeds` |
| Cron hook      | `klyna_feed_regenerate` |
| REST namespace | `klyna-feed/v1`       |
| Text domain    | `wp-feed`             |
| Public feed    | `/klyna-feed/{google,meta}/` |

## Local development

This plugin is plain PHP with no build step. To develop:

1. Symlink or copy `plugins/wp-feed/` to
   `wp-content/plugins/wp-feed/` inside any WordPress install
   (Local, Docker, MAMP, a dev VPS) that also has WooCommerce.
2. Activate **Klyna Product Feed** from `wp-admin → Plugins`.
3. Edit files in `plugins/wp-feed/` and reload.

Quick disposable WP + WooCommerce install:

```bash
# Requires Docker
docker run --rm -p 8080:80 \
  -v "$(pwd)/plugins/wp-feed:/var/www/html/wp-content/plugins/wp-feed" \
  wordpress:latest
```

Open <http://localhost:8080>, run the WP installer, install WooCommerce, then
activate the plugin.

> **Cron tip:** WordPress cron only fires on page loads. To test scheduled
> regeneration deterministically, run
> `wp cron event run klyna_feed_regenerate` with WP-CLI, or hit the
> dashboard's **Regenerate now** button.

## Layout

```
plugins/wp-feed/
├── wp-feed.php             # Main file (header + autoload + bootstrap + activation)
├── readme.txt              # WordPress.org plugin directory format
├── uninstall.php           # Cleanup on plugin delete (options, cron, table)
├── includes/
│   ├── class-plugin.php          # Orchestrator + shared accessors
│   ├── class-feed-builder.php    # Catalog → Google XML / Meta CSV + health rules
│   ├── class-feed-endpoint.php   # Public token-protected feed URLs (rewrite)
│   ├── class-scheduler.php       # WP-Cron regeneration + schedule reconcile
│   ├── class-storage.php         # Feed cache table (dbDelta)
│   ├── class-rest.php            # Admin REST: regenerate / health / stats
│   └── class-admin.php           # Dashboard, health page, settings, enqueues
├── assets/
│   ├── logo.svg                  # Product logo (Klyna gradient + broadcast glyph)
│   └── admin/
│       ├── admin.css             # Brand-styled admin surface
│       └── admin.js              # Vanilla JS (regenerate, copy, health scan)
└── languages/
    └── wp-feed.pot               # Translation template
```

## Architecture

The plugin is **dependency-free** — no Composer, no PHP frameworks, no npm.
Everything is plain PHP 8.0+. Feeds are cached to a small custom table so the
public URL never has to re-query WooCommerce on a request; the cache is rebuilt
on the WP-Cron schedule (and lazily on the very first hit).

The `Feed_Builder` is the single source of truth: it collects products once and
both renders the markup and runs the health rules off the same normalized item
map, so what the health scanner reports is exactly what ships in the feed.

## Security

- Every admin write goes through `register_setting` + `settings_fields`
  (nonce-checked) or a REST route gated to `manage_options` with the `wp_rest`
  nonce.
- All input is sanitized in `Admin::sanitize_settings()`; all output is escaped
  (`esc_html`, `esc_attr`, `esc_url`, `esc_xml`, CDATA-wrapped feed copy).
- The public feed endpoint authenticates with a constant-time `hash_equals`
  token check and sets `X-Robots-Tag: noindex`.

## STATUS — honest state of things

**Working / real (v0.1.0):**

- Google Shopping XML and Meta CSV generation from live WooCommerce products,
  including variable-product variations with `item_group_id`.
- Configurable field mapping (gtin/brand/condition/category meta keys) with
  per-product meta overrides and sitewide defaults.
- Include/exclude category filters and in-stock-only filtering.
- WP-Cron scheduling with self-reconciling intervals when settings change.
- Token-protected public feed URLs via a rewrite endpoint, served from cache.
- Feed health scanner (REST + admin UI) for missing required fields.
- Clean uninstall (options, cron, cache table).

**Known limitations / not yet built:**

- **Multi-currency / multi-region feeds** are not supported; the feed uses the
  store's base currency via `wc_get_price_to_display`.
- **Tax & shipping attributes** (`g:tax`, `g:shipping`) are not emitted — most
  merchants configure these in Merchant Center directly. Could be added.
- **Large catalogs (50k+ SKUs)** are built in a single pass in memory. A
  batched/chunked builder would be the next step for very large stores.
- **No automated PHPUnit suite yet.** Logic is structured for testability
  (pure mapping methods on `Feed_Builder`) but tests are not included in this
  drop.
- **Google taxonomy** is free-text in settings — there is no bundled category
  picker. Per-product overrides via `_google_product_category` work today.
- Has not yet been run through the WordPress.org Plugin Check / readme
  validator on a stock install.

No paid APIs, no telemetry, no external calls of any kind.
