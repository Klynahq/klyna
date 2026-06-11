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
  /** One-line install instruction shown in the download card */
  installNote?: string;
}

/**
 * Single source of truth for the studio's product catalog.
 * The website, dashboard, and any docs hub all import from here.
 */
export const products: Product[] = [
  // ─── Original three ───────────────────────────────────────────────────────
  {
    slug: 'inspector',
    name: 'Klyna Inspector',
    tagline: 'On-page SEO in your browser.',
    description:
      'A browser extension that audits any page in one click — schema, meta, headings, links, performance. Pure client-side, zero tracking.',
    status: 'soon',
    surface: 'extension',
  },
  {
    slug: 'wp-suite',
    name: 'Klyna SEO Suite',
    tagline: 'Autopilot SEO for WordPress.',
    description:
      'Internal linking, schema, content freshness and FAQ generation — installed as a single plugin. Runs on your own server.',
    status: 'soon',
    surface: 'wordpress',
  },
  {
    slug: 'shopify',
    name: 'Klyna for Shopify',
    tagline: 'Organic growth for stores.',
    description:
      'Programmatic product page optimization, schema, internal linking and review collection for Shopify merchants.',
    status: 'planning',
    surface: 'shopify',
  },

  // ─── 10 Shopify Apps ──────────────────────────────────────────────────────
  {
    slug: 'shopify-bundles',
    name: 'Klyna Bundles',
    tagline: 'Bundles, FBT & volume discounts that lift AOV.',
    description:
      'Bundle builder with fixed + mix-and-match modes, frequently-bought-together from order history, volume discount tiers, and a Theme App Extension block on your PDP.',
    status: 'beta',
    surface: 'shopify',
    downloadUrl: '/downloads/shopify-bundles.zip',
    installNote: 'Unzip → shopify app config link → pnpm dev',
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
    tagline: 'Photo reviews, UGC & rich-snippet stars that build trust and rank.',
    description:
      'Collect star + photo reviews, automate review-request emails after fulfillment, moderate from admin, and inject AggregateRating JSON-LD for Google rich snippets.',
    status: 'beta',
    surface: 'shopify',
    downloadUrl: '/downloads/shopify-reviews.zip',
    installNote: 'Unzip → shopify app config link → pnpm dev',
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
    tagline: 'Restock alerts & waitlists that recover lost sold-out demand.',
    description:
      '"Notify me" on sold-out variants, email/SMS interest capture, back-in-stock alerts on inventory webhook, and a demand report of most-wanted products.',
    status: 'beta',
    surface: 'shopify',
    downloadUrl: '/downloads/shopify-restock.zip',
    installNote: 'Unzip → shopify app config link → pnpm dev',
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
    case 'live':     return 'Live';
    case 'beta':     return 'Beta';
    case 'soon':     return 'Coming soon';
    case 'planning': return 'Planning';
  }
}

export function surfaceLabel(surface: ProductSurface): string {
  switch (surface) {
    case 'extension': return 'Browser Extension';
    case 'wordpress': return 'WordPress Plugin';
    case 'shopify':   return 'Shopify App';
    case 'web':       return 'Web App';
    case 'theme':     return 'Shopify Theme';
  }
}

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
