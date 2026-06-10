# Klyna — context for Claude

Indie studio building open, modern SEO + GEO tools. Same TypeScript engine
powers the marketing site, browser extension, WordPress plugin, and Shopify
app. Free where it can be. No paid APIs in the default stack.

## Production

- **Site:** https://klyna.dev (Vercel, auto-deploys from `main`)
- **Repo:** https://github.com/klynahq/klyna
- **Org:** GitHub `klynahq`, Vercel project `klyna`, Cloudflare DNS
- **Domain:** klyna.dev (A records → `76.76.21.21`, DNS-only / gray cloud)

## Monorepo layout

```
klyna/
├── apps/
│   ├── website/        # Astro 6 + Tailwind v4. The marketing site.
│   ├── extension/      # Chrome extension (Manifest V3 + Vite + React 18)
│   ├── wordpress/      # WP plugin (PHP 8.3) + admin-ui/ React app
│   └── shopify/        # Remix + Polaris + App Bridge (needs Partner credentials)
├── packages/
│   ├── core/           # @klyna/core — SEO/GEO audit engine, schema, TF-IDF linking
│   ├── ui/             # @klyna/ui — design tokens (palette, fonts, spacing)
│   ├── utils/          # @klyna/utils — products catalog, formatters
│   └── tsconfig/       # @klyna/tsconfig — shared TS configs
├── pnpm-workspace.yaml # patterns: apps/*, apps/wordpress/admin-ui, packages/*
├── turbo.json
└── vercel.json         # monorepo build config for the website
```

## Tech stack (pinned choices)

- **Package manager:** pnpm 9.15.0 (via Corepack — `corepack enable pnpm`)
- **Orchestrator:** Turborepo
- **Language:** TypeScript 5.7
- **Lint/format:** Biome 1.9 (single tool, replaces ESLint + Prettier)
- **Website:** Astro 6.4.5 + Tailwind v4 + MDX content collections
- **React apps:** React 18.3 (pinned via `pnpm.overrides`), Vite 6
- **Styles:** Tailwind v4 with `@theme` tokens scoped per surface
- **Database (Shopify only):** Prisma + SQLite for sessions
- **Tests:** PHP-side audit scripts in `apps/wordpress/tests/`

## Brand identity (always match)

- **Accent:** electric violet `#7c5cff` (hover `#9277ff`, soft `rgba(124,92,255,0.12)`)
- **Background:** `#0b0b0f` base, `#13131a` elevated, `#1a1a23` surface
- **Border:** `#2a2a35`
- **Text:** `#f4f4f5` / muted `#a1a1aa` / dim `#71717a`
- **Font:** Geist Sans + Geist Mono (loaded from Google Fonts)
- **Logo mark:** gradient violet square with a right-arrow K glyph
- **Voice:** honest, indie, no marketing fluff, no dark patterns
- All design tokens live in `packages/ui/src/tokens.ts` and the website's
  `apps/website/src/styles/global.css`. WP admin-ui mirrors them under the
  `--color-klyna-*` namespace scoped to `#klyna-admin-root`.

## Commands

```bash
pnpm install                      # install everything
pnpm dev                          # turbo dev — all apps
pnpm --filter website dev         # marketing site (localhost:4321)
pnpm --filter website build       # static build
pnpm typecheck                    # turbo typecheck
pnpm lint                         # biome check
pnpm format                       # biome format --write
```

### WordPress plugin dev loop

```bash
cd apps/wordpress
docker compose up -d              # WP 6.7 + MySQL 8 (Colima for the docker engine)
./dev-setup.sh                    # installs WP, activates plugin, seeds demo posts
# Admin:  http://localhost:8080/wp-admin   (admin/admin)
# Plugin: ?page=klyna (Dashboard) / klyna-audit / klyna-internal-links / klyna-schema / klyna-settings
cd admin-ui && pnpm build         # rebuild the React admin bundle (auto-mounted)
```

The plugin code is live-mounted into the container — PHP edits are instant.
React admin bundles need `pnpm build` in `apps/wordpress/admin-ui/`.

## Plugin architecture (the heart of the project)

- **PHP namespace:** `Klyna\*` autoloaded by name from `includes/class-*.php`
- **Settings option:** `klyna_settings` (one assoc array — defaults applied on read)
- **REST namespace:** `klyna/v1` (require `manage_options`, nonce auth)
- **Front-end injection:** `Schema` class hooks `wp_head` for JSON-LD;
  `Faq` class detects FAQs and emits FAQPage; key names accept both old
  (`enable_org_schema`) and new (`enable_organization`) for compat
- **Admin UI:** React mounts on `<div id="klyna-admin-root">`. Bundle at
  `assets/admin/{index.js, index.css}`. PHP injects `window.klynaBoot`
  with REST URL + nonce
- **Editor sidebar:** Gutenberg `PluginSidebar` registered from
  `assets/editor/index.js` (built IIFE with React externalized to
  `wp.element` — `window.React = window.wp.element` bridge in PHP)
- **AI layer:** `class-ai.php` is pluggable (OpenRouter / Groq / Gemini /
  Cloudflare Workers AI / Ollama). All providers are free-tier
  compatible. User brings their own key via Settings → AI assistant

## Important patterns to keep

- **Findings model.** Audit findings are structured: `{id, category,
  severity, title, message, fix, fixable, ai_fixable, fix_meta}`.
  Adding a new check = adding to `Rest::audit_post()` + (optionally)
  a fix action in `Rest::run_fix_action()`.
- **Auto-fixes are guaranteed.** When a fix can't do the ideal thing,
  it falls back to an "appended Related: [link]" sentence rather than
  doing nothing. See `auto_link_orphan`, `auto_add_outgoing_links`.
- **AI suggestions never auto-apply.** Every AI suggestion goes through
  the React preview modal. Daily call cap defaults to 100 per `klyna_settings.ai_daily_cap`.
- **Defense-in-depth sanitization.** `Rest::normalize_settings()`
  sanitizes string fields on read in case the option is set outside
  the REST path.

## What's done

- ✅ Marketing site live at klyna.dev with blog, RSS, sitemap,
  Organization + BlogPosting JSON-LD, robots.txt, llms.txt for GEO
- ✅ Three blog posts seeded (GEO vs SEO, Internal linking, Hello Klyna)
- ✅ Daily blog automation: `scripts/new-post.mjs` + GitHub Actions
- ✅ WordPress plugin: schema injection, FAQ detection, internal links,
  per-post audit, bulk fix, Gutenberg sidebar, AI assistant (5 providers)
- ✅ Browser extension scaffolded with one-click audit popup
- ✅ Shopify app scaffolded (Remix + Polaris) — needs Partner credentials
- ✅ Comprehensive test pass on WP plugin (16/17 pass, 1 test-infra warn)
- ✅ Vercel auto-deploy on push to `main` via GitHub App

## What's open / safe to work on in parallel

- **Browser extension** (`apps/extension/`) — finish popup UI polish, add
  options page, ship to Chrome Web Store
- **Shopify app** (`apps/shopify/`) — needs user to set up Partner account
  and provide API credentials; then OAuth flow, embedded UI
- **Marketing site polish** (`apps/website/`) — OG image generator,
  per-post hero images, analytics, newsletter signup
- **Daily blog automation** — wire the GH Action body generator to an LLM
- **More auto-fixes in the WP plugin** — see `audit_post()` in
  `apps/wordpress/includes/class-rest.php` for the rubric
- **Standalone Klyna products** — analytics tool, form backend, link-in-bio

Use git worktrees to work on multiple of these in parallel:

```bash
git fetch
git worktree add ../klyna-extension main -B feat/extension-polish
git worktree add ../klyna-shopify main -B feat/shopify-oauth
# Start a new Claude Code chat in each directory.
```

## Don'ts

- **Don't commit `apps/shopify/.env`.** It's in `.gitignore` for a reason.
- **Don't bypass `sanitize_settings()`** — the React admin posts settings
  through `/klyna/v1/settings` which sanitizes; direct `update_option`
  calls in tests are fine, but production code paths go through REST.
- **Don't add a paid SaaS to the default stack.** The product premise is
  "free where it can be" — paid integrations are always opt-in.
- **Don't break the `enable_org_schema` ↔ `enable_organization` alias.**
  The Schema class accepts both. Removing the old key breaks anyone who
  saved settings on an older build.
- **Don't import React directly in the editor bundle.** It's externalized
  to `wp.element` via the classic JSX runtime and the `window.React`
  bridge in PHP. Import from `react` stays — bundling it back in breaks
  Gutenberg hooks.
- **Don't run `npm install` at the website root** — pnpm workspaces;
  use `pnpm install` from repo root or `pnpm --filter <pkg> add ...`.

## When you spawn a new Claude chat for this repo

Tell it:

> Read `CLAUDE.md` at the repo root for full context. Working dir is
> `/Users/adeedaxguy/personal web/klyna`. We use pnpm workspaces +
> Turborepo. Brand accent is violet `#7c5cff`. Production is live at
> klyna.dev with auto-deploy on push to `main`.

Then describe the specific task — the rest is in this file.
