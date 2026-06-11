# Klyna Redirects

> 301/302/307/410 redirect manager with 404 monitor and auto slug-change redirects.

Part of the [Klyna](https://klyna.dev) suite — tools that help your work get found.

## Features

- Exact and regex redirect rules with 301/302/307/410 support
- Hit counter per rule
- 404 monitor with referrer tracking and one-click redirect creation
- Automatic 301 on post slug change
- Daily 404 log pruning via wp-cron
- Clean admin UI (Klyna brand, no jQuery)
- No external services, no paid APIs

## Plugin structure

```
wp-redirects/
├── wp-redirects.php          # Main plugin file, constants, bootstrap
├── includes/
│   ├── class-plugin.php      # Orchestrator (boot)
│   ├── class-database.php    # Table creation (dbDelta), upgrade, pruning
│   ├── class-redirector.php  # Fires redirects on template_redirect
│   ├── class-monitor.php     # Logs 404 hits
│   ├── class-slug-watcher.php# Auto-creates 301 on post slug change
│   └── class-admin.php       # Admin pages: redirects, 404 log, settings
├── assets/
│   ├── admin/admin.css
│   ├── admin/admin.js
│   └── logo.svg
├── languages/wp-redirects.pot
├── readme.txt
└── uninstall.php
```

## Install / dev

1. Copy `plugins/wp-redirects` into your WordPress `wp-content/plugins/` folder.
2. Activate in WP Admin → Plugins.
3. Custom tables (`{prefix}klyna_redirects`, `{prefix}klyna_404_log`) are created on activation.

## Status

**Code complete — needs a live WordPress install to run.**

- No composer dependencies, no paid APIs, no build step (plain PHP + vanilla JS/CSS).
- All admin writes are nonce + capability checked.
- Input sanitized, output escaped throughout.
- Tables dropped cleanly on uninstall.
