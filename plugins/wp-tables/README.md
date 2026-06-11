# Klyna Tables

> Responsive, sortable, searchable data & product tables for WordPress.
> Part of the [Klyna](https://klyna.dev) toolkit — _tools that help your work get found._

Klyna Tables turns plain content into clean, fast, responsive tables with
client-side search, click-to-sort columns, and pagination — built by hand or
imported from CSV, dropped in with a shortcode or block. It runs entirely on
your own server, with **no jQuery** on the front end and **no paid APIs**.

---

## Features

- **Visual builder** — add/remove/reorder columns and rows; per-column type
  (`text`, `number`, `link`, `image`, `html`) and alignment.
- **CSV import** — paste or upload a `.csv`; an RFC-4180-ish parser handles
  quoted fields and embedded commas. Optional header row.
- **Shortcode + block** — `[klyna_table id="123"]` or the server-rendered
  **Klyna Table** Gutenberg block (no build step, classic `registerBlockType`).
- **Client-side UX, zero deps** — search, sort, paginate in pure vanilla JS.
  Degrades to a valid `<table>` with JS off.
- **Responsive** — horizontal scroll on tablets; card-stacking on phones with
  each cell labelled by its column header.
- **WooCommerce mode** — `[klyna_products]` lists products with image, SKU,
  category, price, stock, and an add-to-cart button (AJAX add-to-cart for
  simple products). Column set is configurable.
- **Per-table overrides** — every table can override the global defaults for
  search / sort / pagination / stacking / striping / rows-per-page.
- **Secure by construction** — every REST write checks `manage_options` and a
  `wp_rest` nonce; all input is sanitized, all output escaped.

---

## How it's built

```
wp-tables/
├── wp-tables.php                 # header, constants, autoloader, bootstrap, (de)activation
├── includes/
│   ├── class-plugin.php          # orchestrator + settings accessor/defaults
│   ├── class-table-store.php     # klyna_table CPT + grid data model (JSON in post meta)
│   ├── class-rest.php            # klyna-tables/v1 CRUD, CSV import, settings
│   ├── class-renderer.php        # shared HTML renderer (manual + Woo products)
│   ├── class-shortcode.php       # [klyna_table] / [klyna_products] + asset registration
│   ├── class-admin.php           # admin menu, settings page, asset enqueue
│   └── class-block.php           # server-rendered Gutenberg block
├── assets/
│   ├── admin/admin.js            # vanilla-JS builder app (list + grid editor)
│   ├── admin/admin.css           # dark/violet brand-token admin styling
│   ├── js/tables.js              # front-end runtime: search / sort / paginate
│   ├── js/block.js               # editor block (classic wp.* globals)
│   ├── css/tables.css            # theme-agnostic front-end styles
│   └── logo.svg                  # product logo (3×3 grid glyph)
├── languages/wp-tables.pot       # translation template
├── uninstall.php                 # removes option + every klyna_table post
├── readme.txt                    # WordPress.org listing
├── README.md                     # this file
└── LISTING.md                    # marketplace copy + keywords
```

### Data model

Each table is a `klyna_table` custom post type. The grid is stored as JSON in a
single meta key (`_klyna_table_data`):

```json
{
  "columns": [ { "key": "name", "label": "Name", "type": "text", "align": "left" } ],
  "rows":    [ [ "Widget", "9.99" ] ],
  "source":  "manual"
}
```

Per-table render overrides live in `_klyna_table_config` (each feature is
`true` / `false` / `null`, where `null` means "inherit the global setting").

### Coexistence

This plugin is intentionally namespaced so it can run **alongside** Klyna SEO
Suite and the other Klyna plugins:

- PHP namespace: `KlynaTables\`
- Constants: `KLYNA_TABLES_*`
- Option key: `wp_tables_settings`
- REST namespace: `klyna-tables/v1`
- Post type: `klyna_table`
- Text domain / slug: `wp-tables`

---

## Install (dev)

This is a self-contained, dependency-free plugin — no Composer, no npm build.

```bash
# Symlink or copy into a WordPress install:
ln -s "$(pwd)" /path/to/wordpress/wp-content/plugins/wp-tables
# then activate "Klyna Tables" from Plugins.
```

Admin lives at **WP Admin → Klyna Tables**. Create a table, copy its shortcode,
paste it into any post. With WooCommerce active, try `[klyna_products]`.

### Regenerating the translation template

```bash
wp i18n make-pot . languages/wp-tables.pot --domain=wp-tables
```

---

## STATUS — honest assessment

**Alpha (0.1.0). Feature-complete for the v1 scope; not yet battle-tested.**

What's real and working:

- ✅ `klyna_table` CPT, JSON grid model, exhaustive sanitization on write.
- ✅ Full REST CRUD + CSV import with nonce + `manage_options` checks.
- ✅ Vanilla-JS admin builder (columns, rows, types, align, reorder, CSV, config).
- ✅ Shared renderer used by both shortcode and block (output never drifts).
- ✅ Front-end search / sort / paginate, no jQuery, progressive enhancement.
- ✅ Responsive horizontal scroll + mobile card stacking.
- ✅ WooCommerce product mode with add-to-cart (graceful notice when Woo is off).
- ✅ Clean uninstall (option + all `klyna_table` posts removed).

Known gaps / next up:

- ⏳ **Not yet exercised in a live WP install** in this worktree — code is
  structurally complete and follows core APIs, but needs a smoke test pass
  (`docker compose up`, activate, build a table, render it) before beta.
- ⏳ No automated PHPUnit coverage yet; the existing repo test harness pattern
  (`apps/wordpress/tests/`) should be mirrored here.
- ⏳ Column drag-reorder is button-based (◄ ►); true drag-and-drop is a polish item.
- ⏳ Product mode renders a snapshot at page build; it does not paginate the Woo
  query server-side (client paginates the rendered rows). Fine for catalogs up
  to a few hundred items via the `limit` attribute.
- ⏳ No block.json / `@wordpress/scripts` bundle — the editor block uses the
  classic global API on purpose to stay build-free, matching the repo's
  no-build editor convention.
- ⏳ `.pot` is hand-authored; regenerate with `wp i18n make-pot` before release.

No paid APIs, no network calls, no telemetry. Everything runs locally.

---

## License

GPL-2.0-or-later. © Klyna.
