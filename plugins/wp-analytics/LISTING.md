# Klyna Analytics — Marketplace Listing Copy

## Short Description (150 chars)
Privacy-first, cookieless analytics with a beautiful in-dashboard report. No external services, no PII, no cookie banner needed.

## Full Description

**See who's visiting without the privacy baggage.**

Klyna Analytics tracks pageviews and custom events with a tiny (~2 KB) cookieless JavaScript beacon — no cookies, no fingerprinting, no PII. Everything is aggregated daily in your own database, and the results show up in a clean WordPress dashboard chart.

### Why Klyna Analytics?

Google Analytics requires GDPR cookie consent banners, which hurt UX and sometimes conversion. Klyna Analytics is cookieless by design — no consent banner required in most jurisdictions — while still giving you the core numbers that matter: pages, referrers, trends.

### Features

- **Cookieless tracking**: Uses IP-less, agent-less daily hashing — no cookies, no fingerprints, no PII stored.
- **In-dashboard report**: Top pages, referrers, daily sparkline — all inside WordPress Admin. No leaving your site.
- **REST endpoint beacon**: Lightweight `POST /wp-json/klyna-analytics/v1/track` collects pageviews + custom events.
- **DNT respected**: Clients sending `Do Not Track: 1` are silently skipped.
- **Daily aggregation**: Raw hits bucketed daily; old raw rows pruned automatically via wp-cron.
- **Zero external dependencies**: No Google, no Plausible, no Fathom — everything on your server.
- **Custom events**: Call `KlynaAnalytics.track('event_name', { ... })` from any JS.

### Keywords
wordpress analytics plugin, privacy analytics wordpress, cookieless analytics, GDPR analytics wordpress, no cookie analytics, self-hosted analytics, pageview tracker, klyna analytics, privacy-first wordpress, web analytics plugin

### Target Audience
Privacy-conscious site owners, agencies building GDPR-compliant sites, bloggers who don't want consent banners, small businesses wanting simple stats without SaaS cost.

## Pricing
Free. Open source (GPL-2.0-or-later). Part of the [Klyna](https://klyna.dev) suite.
