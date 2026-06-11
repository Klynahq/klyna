<p align="center">
  <img src="assets/logo.svg" width="64" height="64" alt="Klyna Speed" />
</p>

<h1 align="center">Klyna Speed</h1>

<p align="center">Performance &amp; Core Web Vitals for WordPress — page cache, lazyload, defer, minify.<br/>
<em>Tools that help your work get found.</em></p>

---

Klyna Speed is the performance plugin in the [Klyna](https://klyna.dev) toolkit.
It handles the high-impact Core Web Vitals basics — full-page caching,
lazy-load, defer, minify, preload, and Heartbeat control — **entirely on your
own server, with zero external API calls.** No CDN account, no SaaS, no paid
optimizer.

It is built to coexist with the rest of the Klyna plugins: it uses its own PHP
namespace (`KlynaSpeed\`), its own constants (`KLYNA_SPEED_*`), and its own
option key (`wp_speed_settings`), so it never collides with Klyna SEO Suite or
any sibling plugin.

## Features

| Feature | What it does |
| --- | --- |
| **Full-page disk cache** | Renders each page once, writes the HTML to disk under `wp-content/cache/klyna-speed`, and serves it statically on the next request — skipping PHP, the DB, and the theme. |
| **Smart invalidation** | Saving/deleting a post, approving a comment, switching themes, editing a menu, or saving settings purges exactly the affected URLs (plus the home/archive pages that reference them). |
| **Lazy-load** | Adds `loading="lazy"` + `decoding="async"` to off-screen images and (optionally) iframes. The first image is left eager so the LCP element is never deferred. |
| **Defer JS** | Adds `defer` to non-critical external scripts. jQuery core, jQuery Migrate, and `wp-i18n`/`wp-hooks` are on a denylist; `data-no-defer` opts any tag out. |
| **CSS minify** | Minifies local stylesheets (comments + whitespace stripped) and caches the result on disk. Off-site/CDN URLs are never rewritten. |
| **HTML minify** | Collapses insignificant whitespace and drops comments, preserving `<pre>`, `<textarea>`, `<script>`, and `<style>` verbatim. |
| **Preload** | Emits `<link rel="preload">` for user-listed fonts/images/scripts; fonts get `crossorigin` automatically and the `as`/`type` are inferred from the extension. |
| **Heartbeat control** | `default` / `slow` (60s) / `editor` (editor-only) / `off`. |
| **One-click purge** | Dashboard button, REST endpoint, and a front-end admin-bar shortcut. |

## Architecture

```
wp-speed/
├── wp-speed.php                  # header, constants, autoloader, bootstrap, (de)activation
├── includes/
│   ├── class-plugin.php          # orchestrator + settings accessors
│   ├── class-cache.php           # full-page disk cache + smart invalidation + stats
│   ├── class-optimizer.php       # lazyload, defer, CSS/HTML minify, preload
│   ├── class-heartbeat.php       # Heartbeat throttle / disable
│   ├── class-admin.php           # menu, settings page, dashboard, admin-bar purge
│   └── class-rest.php            # /stats + /purge REST routes (manage_options + nonce)
├── assets/
│   ├── admin/admin.css           # Klyna dark/violet admin theme (scoped)
│   ├── admin/admin.js            # purge button + live stat refresh (no jQuery)
│   ├── css/lazyload.css          # tiny front-end fade-in
│   ├── js/lazyload.js            # IntersectionObserver hydration fallback (no jQuery)
│   └── logo.svg                  # product mark
├── languages/wp-speed.pot        # translation template
├── uninstall.php                 # removes option + cache directory
├── readme.txt                    # WordPress.org listing
├── README.md                     # this file
└── LISTING.md                    # marketplace copy + keywords
```

- **PHP namespace:** `KlynaSpeed\*`, autoloaded by name from `includes/class-*.php`.
- **Constants:** `KLYNA_SPEED_VERSION`, `KLYNA_SPEED_PLUGIN_FILE`,
  `KLYNA_SPEED_PLUGIN_DIR`, `KLYNA_SPEED_PLUGIN_URL`, `KLYNA_SPEED_OPTION_KEY`,
  `KLYNA_SPEED_CACHE_DIR`.
- **Settings option:** `wp_speed_settings` — one associative array; defaults are
  applied on read via `Plugin::defaults()` / `Plugin::get()`.
- **REST namespace:** `klyna-speed/v1` — every route requires `manage_options`
  and a valid `wp_rest` nonce.
- **Text domain:** `wp-speed`.

## How the cache works

1. On `template_redirect` (priority 0) the `Cache` class checks whether the
   request is cacheable (GET, no query string, not logged-in unless opted in,
   not admin/REST/AJAX/feed/search/preview, not excluded).
2. **Hit:** if a fresh file exists (within the TTL) it is streamed with an
   `X-Klyna-Speed: hit` header and the request ends — no further PHP runs.
3. **Miss:** an output buffer is opened. When the page finishes rendering, the
   HTML is written to a deterministic per-URL path (`host/proto-path.html`)
   using a temp-file + rename for a near-atomic write.
4. **Invalidation:** content hooks (`save_post`, `comment_post`,
   `switch_theme`, …) delete exactly the affected files; broad changes
   (settings, theme, menus) purge the whole store.

The `Optimizer` opens its own buffer at priority 5, so lazy-load / defer /
HTML-minify run on the *fresh* render before it is cached — which means cache
hits serve already-optimized HTML at zero extra cost.

## Local development

This plugin lives in the Klyna monorepo's WordPress worktree and is designed to
drop straight into a standard WP install — there is **no build step**. The
assets are hand-authored vanilla CSS/JS (no bundler, no jQuery).

```bash
# From a WordPress install:
cp -r plugins/wp-speed /path/to/wp-content/plugins/wp-speed
# then activate "Klyna Speed" from the Plugins screen.
```

Useful checks while hacking on it:

```bash
php -l wp-speed.php                 # lint the main file
find includes -name '*.php' -exec php -l {} \;   # lint every class
```

REST smoke test (replace the nonce/cookies for a logged-in admin):

```bash
curl -s -H 'X-WP-Nonce: <nonce>' https://example.com/wp-json/klyna-speed/v1/stats
curl -s -X POST -H 'X-WP-Nonce: <nonce>' https://example.com/wp-json/klyna-speed/v1/purge
```

## Security

- Every write path checks `current_user_can( 'manage_options' )` **and** a
  nonce (`wp_rest` for REST, `klyna_speed_purge` for the admin-bar GET).
- All input is sanitized (`sanitize_textarea_field`, `sanitize_key`, integer
  clamping); all output is escaped (`esc_html`, `esc_attr`, `esc_url`).
- The cache directory ships an `index.html` and an `.htaccess` (`Options
  -Indexes`) to block directory listing.
- No external requests are made by any code path.

## STATUS — honest notes

**Version 0.1.0 — first release. Functional, self-contained, and safe by
default, but read these caveats before relying on it in production.**

- ✅ **Complete and working:** disk page cache with smart invalidation, lazy-load,
  defer JS, CSS minify (with on-disk caching), HTML minify, preload hints,
  Heartbeat control, settings UI, REST stats/purge, admin-bar purge, clean
  uninstall.
- ⚠️ **PHP-level cache, not a drop-in.** The cache is served from
  `template_redirect`, so WordPress still boots before a hit is returned. This
  is materially faster than a full render but slower than an `advanced-cache.php`
  drop-in that short-circuits before WordPress loads. A drop-in is the natural
  next step; the activation hook already writes a marker to prepare for it.
- ⚠️ **No object cache / no GZIP-on-disk yet.** Pages are stored as plain HTML.
  Serving pre-compressed `.html.gz` variants and emitting `Vary`-aware headers
  is planned.
- ⚠️ **Minification is conservative by design.** CSS minify only touches
  *local* files and skips anything already `.min.css`; it does not concatenate
  or tree-shake. HTML minify is whitespace/comment-level only. JS is deferred,
  never minified or combined (combining third-party JS is fragile and out of
  scope for 0.1.0).
- ⚠️ **Single-cache rule.** Running another full-page cache (W3TC, WP Super
  Cache, host-level) at the same time will conflict — use one. The optimization
  features are safe to run alongside a host cache with the page cache toggled
  off.
- ⚠️ **Mobile/desktop split not implemented.** One cache bucket per URL +
  protocol. If you serve materially different HTML to mobile via PHP (not CSS),
  exclude those URLs.
- 🔭 **Not yet covered by automated tests.** Manually verified against WP 6.7 /
  PHP 8.0–8.3. A PHPUnit pass mirroring `apps/wordpress/tests/` is on the list.

In short: a real, useful, no-dependency performance plugin that does the
80/20 of Core Web Vitals locally — with a clear, honest runway for the
drop-in cache and compression work that comes next.

## License

GPL-2.0-or-later. © Klyna.
