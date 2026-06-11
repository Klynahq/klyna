=== Klyna Tables ===
Contributors: klyna
Tags: tables, responsive table, sortable, csv, woocommerce
Requires at least: 6.4
Tested up to: 6.7
Requires PHP: 8.0
Stable tag: 0.1.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Responsive, sortable, searchable data and product tables. Build by hand or import a CSV, then drop in a shortcode or block. No paid APIs.

== Description ==

**Klyna Tables** is part of the Klyna toolkit — an indie studio building open tools that help your work get found. It turns plain WordPress content into clean, fast, responsive tables with client-side search, click-to-sort columns, and pagination, all from one lightweight plugin.

Built by [Klyna](https://klyna.dev), an indie studio.

= What it does =

* **Visual table builder** — add columns and rows, set column types (text, number, link, image, HTML) and alignment, all from a dark, focused admin.
* **CSV import** — paste a CSV or upload a `.csv` file and Klyna builds the grid for you (quoted fields and embedded commas handled).
* **Shortcode + block** — drop `[klyna_table id="123"]` into any post, or insert the **Klyna Table** block. Output is server-rendered, so it works everywhere.
* **Client-side search, sort, paginate** — pure vanilla JavaScript, **no jQuery**. The table is a valid `<table>` even with JS disabled.
* **Responsive by default** — long tables scroll horizontally; on phones they stack into readable cards (each cell labelled with its column).
* **WooCommerce product tables** — `[klyna_products]` lists products with image, price, stock, and an add-to-cart button. Choose which columns to show.
* **Runs entirely on your server** — no third-party APIs, no API keys, no data leaves your site.

= Designed to stay out of the way =

Klyna Tables inherits your theme's fonts and colors and only paints the structural bits — borders, zebra stripes, the sort affordance, and the pager — with a single configurable accent. Every table can override the global defaults for search, sort, pagination, stacking, and rows-per-page.

== Installation ==

1. Upload the `wp-tables` folder to `/wp-content/plugins/`.
2. Activate the plugin from **Plugins** in the WordPress admin.
3. Go to **Klyna Tables** and create your first table (or import a CSV).
4. Copy the table's shortcode (e.g. `[klyna_table id="12"]`) into any post or page, or insert the **Klyna Table** block.
5. (Optional) With WooCommerce active, drop `[klyna_products]` anywhere for a product table.

== Frequently Asked Questions ==

= Does it load jQuery? =

No. The front-end runtime is dependency-free vanilla JavaScript. Tables remain valid, readable HTML even with JavaScript turned off.

= Does it call any external services? =

No. Building, importing, and rendering all happen on your own server. No third-party API keys required.

= How do I import a spreadsheet? =

Export it as CSV from Excel, Numbers, or Google Sheets, then use **Import CSV** in the table builder — paste the text or upload the file. The first row can be treated as a header.

= Can I show WooCommerce products? =

Yes. With WooCommerce active, use the `[klyna_products]` shortcode or pick **WooCommerce products** in the block. Configure which columns appear under **Klyna Tables → Settings**.

= Will it slow down my site? =

No. Front-end assets are only enqueued on pages that actually contain a table, and search/sort/pagination run in the browser with no extra requests.

= Where is my data stored? =

Each table is a custom post (`klyna_table`) in your own WordPress database. Plugin settings live in a single option. Nothing is collected.

== Screenshots ==

1. The table manager — every table with row/column counts, source, and a copy-ready shortcode.
2. The grid builder with column types, CSV import, and per-table feature overrides.
3. A rendered table on the front end with live search, sortable headers, and pagination.
4. A WooCommerce product table with add-to-cart buttons.

== Changelog ==

= 0.1.0 =
* Initial release.
* Visual table builder stored as a `klyna_table` custom post type.
* CSV import (quoted-field aware) replacing a table's grid.
* `[klyna_table]` shortcode and server-rendered **Klyna Table** block.
* Vanilla-JS client-side search, click-to-sort, and pagination (no jQuery).
* Responsive horizontal scroll plus mobile card stacking.
* WooCommerce product-table mode via `[klyna_products]` with add-to-cart.
* REST API (klyna-tables/v1) with nonce + capability checks for all writes.

== Upgrade Notice ==

= 0.1.0 =
First public release.
