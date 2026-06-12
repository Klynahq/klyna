# Klyna — Tomorrow's Deploy Runbook

**Why this file exists:** the Shopify-app deploy workflow hit Vercel's free-tier daily limit (100 deploys/day). Code work is 100% done and pushed to GitHub. This runbook lists every command you need to run once the limit resets (~24h) or after upgrading Vercel to Pro.

---

## Status as of last run

### ✅ Code is complete and pushed
All 11 Shopify apps have:
- 3 GDPR mandatory webhooks (`customers/data_request`, `customers/redact`, `shop/redact`) wired through `authenticate.webhook()` for HMAC verification
- Prisma datasource switched from `sqlite` → `postgresql`
- Committed and pushed to `feat/<slug>` branches on `klynahq/klyna`

### 🟢 Live and healthy
- `https://klyna.dev` — marketing site, legal pages, help center, contact form
- `https://klyna-rewards.vercel.app` — Klyna Rewards (live, GDPR webhooks responding correctly)
- `https://klyna-urgency.vercel.app` — Klyna Urgency (same)

### 🟡 Deployed but errored (env vars missing)
- `https://klyna-shopify-restock.vercel.app` — 500s (likely missing DATABASE_URL or SHOPIFY_API_SECRET)
- `https://klyna-shopify-upsell.vercel.app` — same
- `https://klyna-wishlist.vercel.app` — root 200, but webhook routes 404 (older deploy, needs rebuild)

### 🔴 Projects linked, no successful production deploy yet
- `klyna-bundles`, `klyna-capture`, `klyna-feed`, `klyna-shopify-reviews`, `klyna-sticky-cart`, `klyna-seo`

### 🔴 Admin panel
- Project `klyna-admin` linked, env vars set, code ready — **deploy blocked by rate limit**
- Custom domain `admin.klyna.dev` not yet set in Cloudflare

---

## Three external prerequisites (~5 minutes)

### 1. Accept Neon marketplace terms (browser only — Vercel CLI can't do this)

Open: `https://vercel.com/adnanaimanager-3376s-projects/~/integrations/accept-terms/neon`

Click **Accept**. This unblocks `vercel storage create --type postgres` for all subsequent projects.

### 2. Wait for Vercel rate limit OR upgrade to Pro

**Free path:** wait ~24h from the moment the workflow stopped (around 06:30 PKT today). Limit resets at 00:00 UTC.

**Faster path:** `https://vercel.com/account/billing` → Upgrade to Pro ($20/mo). Removes the 100/day cap immediately.

### 3. Add Cloudflare CNAME for the admin domain

In Cloudflare DNS for `klyna.dev`:
- **Type:** CNAME
- **Name:** admin
- **Target:** `cname.vercel-dns.com`
- **Proxy:** DNS only (grey cloud)

---

## Step-by-step deploy (run all of this when ready)

### Step A: provision 12 Postgres databases (one per app)

```bash
for project in klyna-admin klyna-bundles klyna-capture klyna-feed klyna-rewards klyna-shopify-restock klyna-shopify-reviews klyna-shopify-upsell klyna-urgency klyna-seo klyna-shopify-sticky-cart klyna-wishlist; do
  echo "=== Provisioning $project DB ==="
  cd ~/personal\ web/klyna  # any linked project works
  # Vercel will prompt to attach to the right project
  vercel storage create "${project}-db" --type postgres --yes
done
```

Each will print a `DATABASE_URL`. Save them — you'll attach each to the matching project in Step B.

### Step B: set env vars per app (auto-script)

Use the helper at `scripts/deploy-shopify-app.sh` (created below). For each app:

```bash
cd ~/personal\ web/klyna-shopify-bundles/apps/shopify-bundles
SHOPIFY_API_SECRET=<from-partners-dashboard> \
DATABASE_URL=<from-step-A> \
../../../klyna/scripts/deploy-shopify-app.sh shopify-bundles
```

You can find each app's `SHOPIFY_API_SECRET` at:
`https://partners.shopify.com/<your-org-id>/apps/<app-id>/configuration` → API key and secret key

Repeat for all 11 apps. The script:
1. Pulls `SHOPIFY_API_KEY` from `shopify.app.toml`
2. Pulls `SCOPES` from same
3. Pipes all envs into `vercel env add` (production scope)
4. Runs `vercel deploy --prod --yes`
5. Updates `application_url` in toml to the new Vercel URL
6. Runs `shopify app deploy --force` to push to Partner dashboard
7. Commits + pushes the toml update

### Step C: deploy admin panel

```bash
cd ~/personal\ web/klyna/apps/admin
# DATABASE_URL still needs to be set (run from Step A)
vercel env add DATABASE_URL production --force <<< "<postgres-url>"
vercel deploy --prod --yes
vercel domains add admin.klyna.dev klyna-admin
```

Then visit `https://admin.klyna.dev/admin/login` and request a magic link. Without a `RESEND_API_KEY` set, the link is logged to Vercel's deploy logs (`vercel logs klyna-admin --follow`) instead of being emailed. Click the URL from the logs to verify the auth flow.

### Step D: optional — set Resend for real emails

1. Sign up at `https://resend.com` (no credit card)
2. Add and verify `klyna.dev` as a sending domain
3. Get an API key
4. `vercel env add RESEND_API_KEY production --force` (target `klyna-admin` AND `klyna`)
5. Redeploy both

---

## What remains manual for App Store submission

These are dashboard-only steps that no CLI or script can do:

### 1. App listing assets (per app)
- **Icon:** 1024×1024 PNG, transparent or violet background, K-glyph
- **Screenshots:** 3–6 at 1600×900, showing admin UI + storefront effect
- **Demo video (optional but recommended):** 30–60s screen capture
- **Listing copy:**
  - Tagline (160 chars)
  - Long description (sections: What it does, How it works, Pricing, Support)
  - Key benefits (3–5 bullets)
  - Pricing model: **Free**
- **Required URLs:**
  - Privacy: `https://klyna.dev/legal/privacy`
  - Terms: `https://klyna.dev/legal/terms`
  - Support: `https://klyna.dev/contact`

### 2. Demo store
Shopify reviewers test your app on a store you provide. Use your existing `klynadev.myshopify.com`:
- Seed it with 10–20 test products
- Add a few collections
- Install each app on it
- In the listing, provide the URL + reviewer login (use a custom-permission staff account, not your owner login)

### 3. Submit for review
`https://partners.shopify.com` → each app → **Distribution** → **Set up Shopify App Store listing** → fill the listing → **Submit for review**.

Shopify reviews in **2–4 weeks** typically. First-pass rejection is normal; iterate on their feedback.

---

## App Store SOPs already met (verified in code)

- ✅ HMAC verification on all webhooks via `authenticate.webhook()` from `@shopify/shopify-app-remix`
- ✅ Three GDPR mandatory compliance webhooks present and respond
- ✅ Session storage on Postgres (serverless-safe)
- ✅ Scope minimization per app (each toml lists only what the app actually uses)
- ✅ Privacy policy + Terms + Security disclosure live on `klyna.dev/legal/*`
- ✅ App Bridge React (embedded apps)
- ✅ Free pricing (no Billing API needed)
- ✅ BYOK AI — no third-party API calls without explicit merchant consent
- ✅ Built for Shopify automated check basics: HTTPS, valid HMAC, OAuth, embedded

## What Shopify will still ask you about

These are subjective, judged at review:
- App performance (Core Web Vitals on embedded pages)
- UX quality (does the app actually feel like a Polaris-native admin)
- Brand consistency (icon, screenshots, copy)
- Storefront performance impact (theme app extensions must be tiny)
- Demo store experience (reviewer must be able to test all features in <10 min)
