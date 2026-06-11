# Klyna — Go Live Runbook

## Prerequisites
- Vercel CLI authenticated (`vercel login` if not)
- GitHub CLI authenticated (`gh auth status`)
- Cloudflare DNS access for klyna.dev
- Free Resend account at https://resend.com (1 month free, no card needed)
- Free Neon Postgres at https://neon.tech (or use Vercel Postgres)

## Step 1: Provision third-party accounts
1. Resend → create account → grab API key → paste into `SECRETS.md`.
2. Neon → create Project `klyna-admin` → copy POOLED connection string → paste into `SECRETS.md` as `DATABASE_URL`.
3. GitHub PAT → https://github.com/settings/tokens/new?scopes=repo&description=klyna-support-sync → copy → paste into `SECRETS.md` as `GITHUB_TOKEN`.

## Step 2: Deploy the admin panel
1. Open `SECRETS.md` and copy all admin-panel env vars.
2. `./scripts/deploy-admin.sh`
3. In Vercel dashboard → `klyna-admin` project → Settings → Environment Variables → paste each var (Production scope).
4. Add custom domain `admin.klyna.dev` → Vercel will show a CNAME target. Add `CNAME admin` to that target in Cloudflare (DNS-only / grey cloud).
5. Once DNS propagates, visit https://admin.klyna.dev/admin/login. Enter your email. Check inbox for the magic link. Click. You should land in the dashboard.

## Step 3: Deploy the website
1. `./scripts/deploy-website.sh`
2. Paste the env vars from `SECRETS.md` into the `klyna` project on Vercel.
3. Visit https://klyna.dev/contact and submit a test ticket. Check `klynahq/klyna-support` on GitHub for the issue.
4. Visit https://klyna.dev/help, https://klyna.dev/legal — confirm everything renders.

## Step 4: Test one Shopify app end-to-end
1. `cd ../klyna-shopify-bundles/apps/shopify-bundles`
2. `shopify app dev --store=klynadev.myshopify.com --reset`
3. Open the embedded app → Settings → paste a free OpenRouter key (get one at https://openrouter.ai/keys) → Test connection.
4. Open `/app/suggest` — confirm AI bundles appear.

## Step 5: Verify install telemetry
1. In Docker WP admin, go to any Klyna plugin → Settings → toggle "Share anonymous install stats" → Save.
2. Within 5 minutes, visit https://admin.klyna.dev/admin/installs → confirm a ping row appears.

## Step 6: Verify download tracking
1. Visit https://klyna.dev/products/wp-speed → click the download zip link.
2. Visit https://admin.klyna.dev/admin/downloads → confirm the download row appears.

## Rollback
Every deploy step is non-destructive. To rollback: `vercel rollback` in either project.
