# Klyna Admin

Single-operator admin panel for the Klyna fleet (21 plugins/apps/themes).
Magic-link auth, no third-party scripts, Tailwind v4 + Klyna brand tokens, Prisma + SQLite.

## Stack

- Remix (Vite plugin) + Node SSR
- Tailwind v4 (`@tailwindcss/vite`)
- Prisma + SQLite (`DATABASE_URL=file:./dev.db`)
- `@klyna/ui` shared brand tokens

## Local setup

```bash
cd apps/admin
cp .env.example .env
pnpm install
pnpm prisma:generate
pnpm prisma:push        # creates dev.db from schema
pnpm dev
```

Open http://localhost:3100/admin/login. Enter an email from `ADMIN_EMAILS`.

If `RESEND_API_KEY` is empty (the default in dev), the magic link is **printed to the server console** instead of emailed. Copy the URL and open it in your browser.

## Required environment variables

| Var | Required? | Purpose |
|-----|-----------|---------|
| `DATABASE_URL` | yes | Prisma SQLite path, e.g. `file:./dev.db` |
| `SESSION_SECRET` | yes (prod) | HMAC for session cookies, magic links, CSRF |
| `ADMIN_EMAILS` | yes | Comma-separated allowlist |
| `RESEND_API_KEY` | optional | If set, magic links + ticket replies are emailed |
| `RESEND_FROM` | optional | `Klyna Admin <admin@klyna.dev>` |
| `KLYNA_INGEST_SECRET` | yes (prod) | Shared secret for `/api/track/*`, `/api/tickets/sync` |
| `GITHUB_TOKEN` | optional | Mirrors new tickets to `klyna/community` |
| `GITHUB_REPO` | optional | e.g. `klyna/community` |
| `APP_URL` | yes | Public origin, used in magic-link URLs |

## Public ingest endpoints

All require `X-Klyna-Secret: $KLYNA_INGEST_SECRET` and are rate-limited per-IP.

- `POST /api/track/download` — `{ slug, kind, country? }`
- `POST /api/track/install` — `{ slug, kind, version, hostHash, wpVersion?, phpVersion? }`
- `POST /api/tickets/sync` — `{ email, subject, message, slug? }`

`slug` matches `^[a-z0-9][a-z0-9-]{1,60}$`, `kind` is one of `wp|shopify|theme`.
IPs are SHA-256 hashed with a **daily-rotated salt** before storage.

## Security baseline

- Magic-link auth, 15-min token expiry, single-use tokens.
- Session cookie: HMAC-signed, `HttpOnly`, `SameSite=Lax`, `Secure` in prod, 8h absolute lifetime.
- CSRF: every mutating form posts a `csrf` token bound to the session id.
- Response headers (set in `entry.server.tsx`): CSP with `default-src 'self'`, `frame-ancestors 'none'`, no inline scripts; `X-Frame-Options DENY`, `X-Content-Type-Options nosniff`, `Referrer-Policy strict-origin-when-cross-origin`, HSTS in production.
- Rate limits: 5/min/IP login form, 60/min/IP track endpoints, 30/min/IP ticket sync.
- All Prisma queries use parameterized inputs.
- All auth events (success, fail, rate-limit) are logged to `AuthEvent` and surfaced at `/admin/security`.

## Deploy (Vercel)

This is a stock Remix Vite app — `vercel.json` at the repo root already routes to Remix builds. Make sure the following env vars are set in Vercel:

```
DATABASE_URL
SESSION_SECRET
ADMIN_EMAILS
RESEND_API_KEY
RESEND_FROM
KLYNA_INGEST_SECRET
APP_URL=https://klyna.dev
```

For production storage swap `DATABASE_URL` to Postgres and change the `datasource` provider in `prisma/schema.prisma` to `postgresql`, then `pnpm prisma migrate deploy`.

## Routes

| Path | Purpose |
|------|---------|
| `/admin` | Dashboard — downloads, active installs, open tickets, 30-day sparkline |
| `/admin/downloads` | Filterable downloads table, CSV export |
| `/admin/installs` | Active install estimate per product+version |
| `/admin/tickets` | Triage + reply (via Resend) |
| `/admin/articles` | Help-article CRUD |
| `/admin/security` | Recent auth events, rate-limit hits |
| `/admin/settings` | Allowlist & integration status |
| `/admin/login` | Magic-link request |
| `/admin/auth/verify` | Consume token, set session |
| `/admin/logout` | Destroy session |
