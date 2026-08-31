/**
 * @klyna/utils — tiny shared helpers.
 */

export type ProductStatus = 'live' | 'beta' | 'soon' | 'planning';
export type ProductSurface = 'extension' | 'wordpress' | 'shopify' | 'web' | 'theme';

export interface Product {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  status: ProductStatus;
  surface: ProductSurface;
  href?: string;
  /** Relative path to a downloadable zip served from /public/downloads/ */
  downloadUrl?: string;
  /** Public Shopify App Store listing for approved apps. */
  appStoreUrl?: string;
  /** One-line install instruction shown in the download card */
  installNote?: string;
}

/**
 * Single source of truth for the studio's product catalog.
 * The website, dashboard, and any docs hub all import from here.
 */
export const products: Product[] = [
  // ─── Founder trio — the original three, all now in beta with downloads ───
  {
    slug: 'klyna-inspector',
    name: 'Klyna Inspector',
    tagline: 'On-page SEO + GEO audit, one click, any page.',
    description:
      'Manifest V3 Chrome extension. Audits the current tab for meta, headings, links, images, schema, OG cards and GEO citation-readiness — pure client-side, zero tracking. Powered by the shared @klyna/core engine.',
    status: 'beta',
    surface: 'extension',
    downloadUrl: '/downloads/klyna-inspector.zip',
    installNote: 'Chrome → chrome://extensions → Load unpacked → select unzipped folder',
  },
  {
    slug: 'wp-seo-suite',
    name: 'Klyna SEO Suite',
    tagline: 'Autopilot SEO + GEO for WordPress, with AI assistant built in.',
    description:
      'React admin, Gutenberg sidebar, one-click bulk fixes, TF-IDF internal linking, FAQPage detection, Organization/Article/Breadcrumb schema, and a pluggable AI layer (OpenRouter / Groq / Gemini / Cloudflare / Ollama — all free) for content rewrites. Runs on your own server.',
    status: 'beta',
    surface: 'wordpress',
    downloadUrl: '/downloads/wp-seo-suite.zip',
    installNote: 'Plugins → Add New → Upload → Activate',
  },
  {
    slug: 'shopify-seo-suite',
    name: 'Klyna SEO',
    tagline: 'Prioritized SEO audits for products, collections, and content.',
    description:
      'Audit titles, descriptions, headings, images, links, schema, canonical tags, keywords, Core Web Vitals signals, and AI-search readiness from Shopify admin.',
    status: 'live',
    surface: 'shopify',
    href: '/shopify/seo',
    appStoreUrl: 'https://apps.shopify.com/klyna-seo-clean',
  },

  // --- Shopify App Store review batch ---
  {
    slug: 'shopify-cleanroom',
    name: 'Klyna Cleanroom',
    tagline: 'Find old app code, duplicate pixels, and theme debris safely.',
    description:
      'Diagnostic-first cleanup assistant for Shopify themes. Scans sampled storefront pages for leftover app signatures, duplicate tracking, heavy script stacks, and cleanup risks before any theme edit is made.',
    status: 'live',
    surface: 'shopify',
    href: '/shopify/cleanroom',
    appStoreUrl: 'https://apps.shopify.com/klyna-cleanroom',
    installNote: 'Public App Store app - diagnostic scan first, cleanup workflow guarded',
  },
  {
    slug: 'shopify-promo-qa',
    name: 'Klyna Promo QA',
    tagline: 'Test discount collisions before campaigns go live.',
    description:
      'Promotion preflight for automatic discounts, code discounts, free shipping, markets, and margin risk. Helps merchants catch non-combinable campaigns and forgotten expiry dates before launch.',
    status: 'beta',
    surface: 'shopify',
    href: '/shopify/promo-qa',
    installNote: 'Public App Store app - submitted for review',
  },
  {
    slug: 'shopify-pixel-doctor',
    name: 'Klyna Pixel Doctor',
    tagline: 'Detect duplicate tracking and consent timing issues.',
    description:
      'Neutral storefront tracking diagnostic for Meta, Google, TikTok, Pinterest, consent markers, and hardcoded pixel residue. Helps clean attribution without forcing merchants to replace their stack.',
    status: 'beta',
    surface: 'shopify',
    href: '/shopify/pixel-doctor',
    installNote: 'Public App Store app - submitted for review',
  },
  {
    slug: 'shopify-feed-doctor',
    name: 'Klyna Feed Doctor',
    tagline: 'Find catalog issues before Merchant Center rejects products.',
    description:
      'Feed readiness scanner for GTIN/barcode, SKU, brand, images, product metadata, and variant data. Designed as a fix queue for merchants who are not ready to replace their feed app.',
    status: 'live',
    surface: 'shopify',
    href: '/shopify/feed-doctor',
    appStoreUrl: 'https://apps.shopify.com/klyna-feed-doctor',
    installNote: 'Public App Store app - feed diagnostics and variant-level exports',
  },

  // ─── Shopify Apps ─────────────────────────────────────────────────────────
  {
    slug: 'shopify-bundles',
    name: 'Klyna Bundles',
    tagline: 'Fixed bundles, mix-and-match offers, and quantity breaks.',
    description:
      'Build fixed and mix-and-match offers, add quantity-break tiers, show them through a theme app block, and apply savings with Shopify-native automatic discounts.',
    status: 'live',
    surface: 'shopify',
    href: '/shopify/bundles',
    appStoreUrl: 'https://apps.shopify.com/klyna-bundles',
  },
  {
    slug: 'shopify-redirect-guard',
    name: 'Klyna Redirect Guard',
    tagline: 'Protect SEO traffic from deleted URLs and migration gaps.',
    description:
      'Audit live product, collection, and page URLs for redirect coverage, failed samples, duplicate targets, and migration risk with scan history and a practical fix playbook.',
    status: 'live',
    surface: 'shopify',
    href: '/shopify/redirect-guard',
    appStoreUrl: 'https://apps.shopify.com/klyna-redirect-guard',
  },
  {
    slug: 'shopify-upsell',
    name: 'Klyna Upsell',
    tagline: 'Post-purchase & in-cart upsells that raise revenue per order.',
    description:
      'Offer rules engine by product, collection or cart value. In-cart widget, post-purchase scaffold, A/B test two offers, and conversion analytics dashboard.',
    status: 'beta',
    surface: 'shopify',
    downloadUrl: '/downloads/shopify-upsell.zip',
    installNote: 'Unzip → shopify app config link → pnpm dev',
  },
  {
    slug: 'shopify-rewards',
    name: 'Klyna Rewards',
    tagline: 'Loyalty points, tiers & referrals that bring customers back.',
    description:
      'Earn points for orders, signup and reviews. Redeem for discount codes. Tiers, referral links, a customer-facing widget (Theme App Extension), and a member list.',
    status: 'beta',
    surface: 'shopify',
    downloadUrl: '/downloads/shopify-rewards.zip',
    installNote: 'Unzip → shopify app config link → pnpm dev',
  },
  {
    slug: 'shopify-reviews',
    name: 'Klyna Reviews',
    tagline: 'Photo reviews, moderation, replies, and product-rating markup.',
    description:
      'Show star and photo reviews, moderate submissions, apply spam controls, reply to customers, track rating trends, and add Product and AggregateRating markup.',
    status: 'live',
    surface: 'shopify',
    href: '/shopify/reviews',
    appStoreUrl: 'https://apps.shopify.com/klyna-reviews',
  },
  {
    slug: 'shopify-urgency',
    name: 'Klyna Urgency',
    tagline: 'Countdown timers, low-stock scarcity & social-proof popups.',
    description:
      'Scheduled countdown timers, stock-based scarcity notices, recently-purchased social-proof popups, targeting rules, and impression analytics.',
    status: 'beta',
    surface: 'shopify',
    downloadUrl: '/downloads/shopify-urgency.zip',
    installNote: 'Unzip → shopify app config link → pnpm dev',
  },
  {
    slug: 'shopify-restock',
    name: 'Klyna Back-in-Stock',
    tagline: 'Variant waitlists and timely alerts for sold-out demand.',
    description:
      'Add a variant-level waitlist block, rank demand by item, send automatic email alerts when inventory returns, and filter, re-arm, or export subscribers.',
    status: 'live',
    surface: 'shopify',
    href: '/shopify/back-in-stock',
    appStoreUrl: 'https://apps.shopify.com/klyna-back-in-stock',
  },
  {
    slug: 'shopify-wishlist',
    name: 'Klyna Wishlist',
    tagline: 'Wishlists, guest saves & shareable lists that re-engage shoppers.',
    description:
      'Add-to-wishlist on PDP and collection pages, guest (localStorage) + logged-in saves, shareable wishlist links, and a most-wishlisted analytics report.',
    status: 'beta',
    surface: 'shopify',
    downloadUrl: '/downloads/shopify-wishlist.zip',
    installNote: 'Unzip → shopify app config link → pnpm dev',
  },
  {
    slug: 'shopify-feed',
    name: 'Klyna Feed',
    tagline: 'Product feeds for Google, Meta, TikTok & Pinterest — always in sync.',
    description:
      'Google Shopping XML + Meta/TikTok/Pinterest CSV feeds with field mapping, per-channel rules, metafield support, scheduled refresh, and a feed health report.',
    status: 'beta',
    surface: 'shopify',
    downloadUrl: '/downloads/shopify-feed.zip',
    installNote: 'Unzip → shopify app config link → pnpm dev',
  },
  {
    slug: 'shopify-sticky-cart',
    name: 'Klyna Sticky Cart',
    tagline: 'Sticky add-to-cart, quick-buy & free-shipping progress bar.',
    description:
      'Persistent sticky ATC bar on the PDP with variant + quantity picker, free-shipping progress bar with threshold, quick-buy flow, and mobile-first click analytics.',
    status: 'beta',
    surface: 'shopify',
    downloadUrl: '/downloads/shopify-sticky-cart.zip',
    installNote: 'Unzip → shopify app config link → pnpm dev',
  },
  {
    slug: 'shopify-capture',
    name: 'Klyna Capture',
    tagline: 'Email & SMS popups, spin-to-win & exit-intent that grow your list.',
    description:
      'Popup builder with email/SMS capture, exit-intent, scroll and time triggers, spin-to-win wheel, Shopify marketing consent write-back, and conversion analytics.',
    status: 'beta',
    surface: 'shopify',
    downloadUrl: '/downloads/shopify-capture.zip',
    installNote: 'Unzip → shopify app config link → pnpm dev',
  },

  // ─── 10 WordPress Plugins ─────────────────────────────────────────────────
  {
    slug: 'wp-speed',
    name: 'Klyna Speed',
    tagline: 'Page cache, lazyload, defer JS & Core Web Vitals.',
    description:
      'Full-page disk cache with smart invalidation, image lazy-load, JS defer/async, CSS & HTML minify, asset preload, heartbeat control, and a one-click purge button.',
    status: 'beta',
    surface: 'wordpress',
    downloadUrl: '/downloads/wp-speed.zip',
    installNote: 'Plugins → Add New → Upload → Activate',
  },
  {
    slug: 'wp-forms',
    name: 'Klyna Forms',
    tagline: 'Lead-gen forms with entry storage, spam guard & CSV export.',
    description:
      'Form builder (CPT), shortcode + Gutenberg block, AJAX/REST submit, entry storage with CSV export, honeypot + time-trap spam protection, and admin email notifications.',
    status: 'beta',
    surface: 'wordpress',
    downloadUrl: '/downloads/wp-forms.zip',
    installNote: 'Plugins → Add New → Upload → Activate',
  },
  {
    slug: 'wp-booking',
    name: 'Klyna Booking',
    tagline: 'Appointments & bookings with services, availability & confirmations.',
    description:
      'Services CPT, weekly availability + blackout dates, front-end booking form (shortcode/block), slot calculation, bookings with status management, and confirmation emails.',
    status: 'beta',
    surface: 'wordpress',
    downloadUrl: '/downloads/wp-booking.zip',
    installNote: 'Plugins → Add New → Upload → Activate',
  },
  {
    slug: 'wp-popups',
    name: 'Klyna Popups',
    tagline: 'Email-capture popups, exit-intent & targeted on-site offers.',
    description:
      'Popup CPT with content + design controls, triggers (time/scroll/exit-intent/click), display rules by page/device/visitor type, frequency cap via cookie, and conversion counters.',
    status: 'beta',
    surface: 'wordpress',
    downloadUrl: '/downloads/wp-popups.zip',
    installNote: 'Plugins → Add New → Upload → Activate',
  },
  {
    slug: 'wp-tables',
    name: 'Klyna Tables',
    tagline: 'Responsive, sortable, searchable data & product tables.',
    description:
      'Table builder (manual or CSV import) as CPT, shortcode + block, client-side sort/search/paginate (no jQuery), responsive stacking on mobile, and WooCommerce product-table mode.',
    status: 'beta',
    surface: 'wordpress',
    downloadUrl: '/downloads/wp-tables.zip',
    installNote: 'Plugins → Add New → Upload → Activate',
  },
  {
    slug: 'wp-feed',
    name: 'Klyna Product Feed',
    tagline: 'WooCommerce feeds for Google & Meta, auto-refreshed.',
    description:
      'Google Shopping XML + Meta CSV from WooCommerce products, field mapping (GTIN, brand, condition), include/exclude rules, wp-cron refresh, and feed health warnings.',
    status: 'beta',
    surface: 'wordpress',
    downloadUrl: '/downloads/wp-feed.zip',
    installNote: 'Plugins → Add New → Upload → Activate',
  },
  {
    slug: 'wp-reviews',
    name: 'Klyna Reviews',
    tagline: 'Collect & display reviews with rich-snippet stars and moderation.',
    description:
      'Review form (shortcode/block), 5-star ratings, moderation queue, AggregateRating + Review JSON-LD schema, optional review-request email, and honeypot spam guard.',
    status: 'beta',
    surface: 'wordpress',
    downloadUrl: '/downloads/wp-reviews.zip',
    installNote: 'Plugins → Add New → Upload → Activate',
  },
  {
    slug: 'wp-analytics',
    name: 'Klyna Analytics',
    tagline: 'Privacy-first, cookieless analytics with an in-dashboard report.',
    description:
      'Cookieless beacon, REST endpoint, daily aggregation in a custom table, and an in-dashboard top-pages/referrers/sparkline report. No cookies, no PII, no external services.',
    status: 'beta',
    surface: 'wordpress',
    downloadUrl: '/downloads/wp-analytics.zip',
    installNote: 'Plugins → Add New → Upload → Activate',
  },
  {
    slug: 'wp-redirects',
    name: 'Klyna Redirects',
    tagline: '301/302 redirect manager with 404 monitor and auto-redirects.',
    description:
      'Manage 301/302/307/410 redirects (exact + regex), 404 logging with hit counts, one-click create-redirect-from-404, and auto-301 when a post slug changes.',
    status: 'beta',
    surface: 'wordpress',
    downloadUrl: '/downloads/wp-redirects.zip',
    installNote: 'Plugins → Add New → Upload → Activate',
  },
  {
    slug: 'wp-consent',
    name: 'Klyna Consent',
    tagline: 'GDPR/CCPA cookie consent banner with Google Consent Mode v2.',
    description:
      'Consent banner with accept/reject/preferences, cookie categories, Google Consent Mode v2 dataLayer signals, script blocking until consent, and geo-aware display.',
    status: 'beta',
    surface: 'wordpress',
    downloadUrl: '/downloads/wp-consent.zip',
    installNote: 'Plugins → Add New → Upload → Activate',
  },

  // ─── 2 Shopify Themes ─────────────────────────────────────────────────────
  {
    slug: 'theme-aurora',
    name: 'Aurora by Klyna',
    tagline: 'Minimal, lightning-fast, high-conversion Shopify theme.',
    description:
      'Refined typography, generous whitespace, sticky buy, trust row, conversion-optimised PDP. A clean premium theme for DTC brands that want Apple-level polish.',
    status: 'beta',
    surface: 'theme',
    downloadUrl: '/downloads/theme-aurora.zip',
    installNote: 'shopify theme dev --store=<your-store>.myshopify.com',
  },
  {
    slug: 'theme-momentum',
    name: 'Momentum by Klyna',
    tagline: 'Bold, editorial Shopify theme for big catalogs and brand storytelling.',
    description:
      'Oversized headlines, full-bleed imagery, strong grid, lookbook sections, mega-menu for large catalogs. Built for fashion, streetwear and brand-led DTC.',
    status: 'beta',
    surface: 'theme',
    downloadUrl: '/downloads/theme-momentum.zip',
    installNote: 'shopify theme dev --store=<your-store>.myshopify.com',
  },
];

export function statusLabel(status: ProductStatus): string {
  switch (status) {
    case 'live':
      return 'Live';
    case 'beta':
      return 'Beta';
    case 'soon':
      return 'Coming soon';
    case 'planning':
      return 'Planning';
  }
}

export function surfaceLabel(surface: ProductSurface): string {
  switch (surface) {
    case 'extension':
      return 'Browser Extension';
    case 'wordpress':
      return 'WordPress Plugin';
    case 'shopify':
      return 'Shopify App';
    case 'web':
      return 'Web App';
    case 'theme':
      return 'Shopify Theme';
  }
}

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
