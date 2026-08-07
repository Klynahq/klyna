export type ShopifyProductPage = {
  slug: string;
  name: string;
  eyebrow: string;
  description: string;
  hero: string;
  scoreLabel: string;
  metrics: Array<{ label: string; value: string }>;
  features: string[];
  useCases: string[];
  reviewNotes: string[];
};

export const shopifyProductPages: ShopifyProductPage[] = [
  {
    slug: 'cleanroom',
    name: 'Klyna Cleanroom',
    eyebrow: 'Theme debris and old app code cleanup',
    description:
      'Find leftover Shopify app code, duplicate pixels, heavy scripts, and unsafe theme residue before cleanup work begins.',
    hero: 'Cleanroom gives merchants evidence before edits: sampled storefront scans, app-signature detection, duplicate tracker warnings, scan history, and safe cleanup playbooks.',
    scoreLabel: 'Debris score',
    metrics: [
      { label: 'Pages sampled', value: '6' },
      { label: 'App signatures', value: '12' },
      { label: 'Duplicate trackers', value: '2' },
    ],
    features: [
      'Scans homepage, product, and collection samples from the live storefront.',
      'Detects common review, subscription, page-builder, email, and tracking app signatures.',
      'Flags duplicate Meta, Google, TikTok, Pinterest, and affiliate tracking patterns.',
      'Stores scan history so agencies can show before/after cleanup evidence.',
    ],
    useCases: [
      'After uninstalling several Shopify apps.',
      'Before hiring a developer to clean a live theme.',
      'Before speed optimization or Core Web Vitals work.',
      'Before submitting an App Store support ticket about duplicate events.',
    ],
    reviewNotes: [
      'Diagnostic-first and read-mostly.',
      'No automatic destructive theme edits.',
      'Theme cleanup must use backup, preview, and rollback language.',
    ],
  },
  {
    slug: 'promo-qa',
    name: 'Klyna Promo QA',
    eyebrow: 'Discount collision testing before launch',
    description:
      'Preflight Shopify discounts, automatic campaigns, free shipping, and expiry risks before traffic hits checkout.',
    hero: 'Promo QA is built for launch days. It checks active discounts, missing end dates, combine-rule conflicts, and campaign risks so merchants know what customers will actually see.',
    scoreLabel: 'Promo score',
    metrics: [
      { label: 'Active discounts', value: '8' },
      { label: 'No expiry', value: '3' },
      { label: 'Collision risks', value: '2' },
    ],
    features: [
      'Reviews active automatic and code discounts through Shopify Admin GraphQL.',
      'Flags missing expiry dates and non-combinable campaigns.',
      'Creates a clear campaign QA record for teams and agencies.',
      'Designed as QA, not another discount builder.',
    ],
    useCases: [
      'Before BFCM, Eid, Christmas, or flash-sale launches.',
      'Before influencer or paid-ad campaign traffic starts.',
      'When free shipping should work with product discounts.',
      'When merchants want fewer support tickets about discount codes.',
    ],
    reviewNotes: [
      'Does not promise unsupported discount stacking.',
      'Uses clear Shopify-rule language.',
      'Keeps write actions out of the first review version.',
    ],
  },
  {
    slug: 'redirect-guard',
    name: 'Klyna Redirect Guard',
    eyebrow: 'SEO-safe URL monitoring',
    description:
      'Catch deleted products, broken storefront URLs, and weak redirect coverage before organic traffic leaks.',
    hero: 'Redirect Guard gives merchants a simple safety layer around catalog changes, migrations, and deleted pages. It samples live URLs, checks redirect coverage, and turns risks into a fix queue.',
    scoreLabel: 'URL safety score',
    metrics: [
      { label: 'URLs sampled', value: '12' },
      { label: 'Failed URLs', value: '1' },
      { label: 'Redirects found', value: '34' },
    ],
    features: [
      'Samples live product, collection, and content URLs.',
      'Reviews URL redirect coverage from Shopify.',
      'Flags failed sampled URLs and repeated redirect targets.',
      'Built for migrations, catalog pruning, and agency QA.',
    ],
    useCases: [
      'After deleting or hiding products.',
      'During WooCommerce, Webflow, Wix, or custom-store migrations.',
      'Before changing collection handles or navigation.',
      'After importing products from vendors or ERPs.',
    ],
    reviewNotes: [
      'Starts with monitoring and exports.',
      'Bulk write actions should stay explicit and previewed.',
      'Avoids claiming ranking guarantees.',
    ],
  },
  {
    slug: 'pixel-doctor',
    name: 'Klyna Pixel Doctor',
    eyebrow: 'Tracking and consent diagnostics',
    description:
      'Detect duplicate Meta, Google, TikTok, Pinterest, and consent timing risks from the live storefront.',
    hero: 'Pixel Doctor is a neutral debugger for messy tracking stacks. It helps merchants find duplicate event sources and consent gaps without forcing them to replace their analytics setup.',
    scoreLabel: 'Tracking score',
    metrics: [
      { label: 'Platforms found', value: '4' },
      { label: 'Duplicate risks', value: '2' },
      { label: 'Consent hints', value: '6' },
    ],
    features: [
      'Scans storefront HTML for common ad and analytics platform signatures.',
      'Flags possible duplicate event sources by platform.',
      'Looks for consent/privacy API markers near marketing scripts.',
      'Creates an agency-friendly tracking cleanup checklist.',
    ],
    useCases: [
      'After installing a new ads, affiliate, or reviews app.',
      'When Meta or Google reports duplicate purchases.',
      'When Shopify Customer Events and theme pixels may overlap.',
      'Before scaling paid traffic to a newly rebuilt theme.',
    ],
    reviewNotes: [
      'Diagnostic-only; no unsupported claims about platform attribution.',
      'No third-party ad account OAuth required in the first version.',
      'No customer data access needed for the basic scan.',
    ],
  },
  {
    slug: 'feed-doctor',
    name: 'Klyna Feed Doctor',
    eyebrow: 'Catalog readiness for Google Merchant Center',
    description:
      'Find GTIN, SKU, brand, image, and product metadata issues before Shopping products are rejected.',
    hero: 'Feed Doctor is a fix queue for product data quality. It helps merchants clean the catalog fields that feed apps and Google Merchant Center depend on.',
    scoreLabel: 'Feed score',
    metrics: [
      { label: 'Products sampled', value: '60' },
      { label: 'Variants sampled', value: '180' },
      { label: 'Missing GTIN', value: '41' },
    ],
    features: [
      'Reviews sampled products and variants through Shopify Admin GraphQL.',
      'Flags missing barcode/GTIN, SKU, brand/vendor, images, and SEO copy.',
      'Works as diagnostics before merchants switch feed apps.',
      'Creates a cleaner product data backlog for Shopping, Meta, and marketplace feeds.',
    ],
    useCases: [
      'Before submitting a product catalog to Google Merchant Center.',
      'After importing products from dropshippers, vendors, or CSV files.',
      'When disapprovals mention missing identifiers.',
      'Before scaling Performance Max or Shopping campaigns.',
    ],
    reviewNotes: [
      'Does not replace every feed app in v1.',
      'Avoids policy/legal guarantees about Google approvals.',
      'Focuses on visible catalog data quality and fix exports.',
    ],
  },
];
