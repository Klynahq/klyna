# Klyna SEO Suite (WordPress plugin)

Autopilot SEO for WordPress — schema markup, internal linking, FAQ
auto-detection, content freshness. Free, open, no paid APIs.

## Local development

This plugin is plain PHP with no build step. To develop:

1. Symlink or copy `apps/wordpress/` to `wp-content/plugins/klyna-seo-suite/`
   inside any WordPress install (Local, Docker, MAMP, a dev VPS).
2. Activate **Klyna SEO Suite** from `wp-admin → Plugins`.
3. Edit files in `apps/wordpress/` and reload.

Quick way to spin up a disposable WP install:

```bash
# Requires Docker
docker run --rm -p 8080:80 -v "$(pwd)/apps/wordpress:/var/www/html/wp-content/plugins/klyna-seo-suite" wordpress:latest
```

Open <http://localhost:8080>, run the WP installer, activate the plugin.

## Package for WordPress.org

```bash
pnpm --filter wordpress package
```

(see `package.json` script below — produces `klyna-seo-suite.zip`)

## Layout

```
apps/wordpress/
├── klyna-seo-suite.php   # Main plugin file (header + autoload + bootstrap)
├── readme.txt            # WordPress.org plugin directory format
├── uninstall.php         # Cleanup on plugin delete
├── includes/
│   ├── class-plugin.php          # Orchestrator
│   ├── class-schema.php          # Organization/WebSite/BlogPosting/Breadcrumb JSON-LD
│   ├── class-faq.php             # Auto-FAQPage from <details> + Q-headings
│   ├── class-internal-links.php  # TF-IDF link suggestion engine + REST
│   └── class-admin.php           # Admin pages, settings, enqueues
├── assets/
│   ├── css/admin.css
│   └── js/admin.js               # Vanilla JS for the internal-links tool
└── languages/                    # i18n .pot/.po lives here
```

## Architecture

The plugin is intentionally **dependency-free**. No Composer, no PHP frameworks,
no npm. Everything is plain PHP 8.0+. This keeps install size tiny, makes the
plugin trivially auditable for WordPress.org review, and means it works on
any shared host.

The TF-IDF internal-linking algorithm in `class-internal-links.php` mirrors
the TypeScript implementation in `packages/core/src/linking/index.ts` — same
math, same defaults — so the suggestions surface consistently across the
browser extension and the WP plugin.

## What it ships

- Sitewide Organization + WebSite JSON-LD
- BlogPosting + BreadcrumbList JSON-LD on single posts
- FAQPage JSON-LD auto-detected from `<details><summary>` blocks and
  question-shaped headings followed by paragraphs
- A REST endpoint `/wp-json/klyna/v1/internal-links/suggest` that runs the
  TF-IDF engine across every published post and returns top-N suggestions per
  source post (capabilities-gated to `edit_posts`)
- Admin dashboard, settings page, and one-click internal-link tool

## Submission checklist (when ready)

- [ ] All strings translatable (`__()`, `_e()`, `esc_html__`, etc.) — done
- [ ] `readme.txt` valid (tested via WP.org readme validator)
- [ ] No remote calls without explicit user opt-in — confirmed, zero
- [ ] Capabilities checked on every admin action — done
- [ ] Nonces on every form — done (settings via `settings_fields`)
- [ ] No PHP errors, warnings, or notices on a stock WP install
- [ ] Tested with WP_DEBUG and SCRIPT_DEBUG
