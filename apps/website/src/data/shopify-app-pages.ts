export type ShopifyProductPage = {
  slug: string;
  name: string;
  shortName: string;
  category: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  description: string;
  hero: string;
  answer: string;
  statusLabel: string;
  pricingNote: string;
  scoreLabel: string;
  ogImage?: string;
  ogImageAlt?: string;
  screenshotImage?: string;
  screenshotAlt?: string;
  appStoreUrl?: string;
  metrics: Array<{ label: string; value: string }>;
  features: Array<{ title: string; body: string }>;
  workflow: Array<{ title: string; body: string }>;
  useCases: string[];
  proofPoints: string[];
  comparison: Array<{ title: string; body: string }>;
  limits: string[];
  relatedLinks: Array<{ label: string; href: string }>;
  faq: Array<{ question: string; answer: string }>;
};

const sharedRelatedLinks = [
  { label: 'Shopify app stack audit', href: '/blog/shopify-store-audit-checklist' },
  { label: 'Theme app embed cleanup plan', href: '/blog/shopify-theme-app-embed-cleanup-plan' },
  { label: 'Products hub', href: '/products' },
];

export const shopifyProductPages: ShopifyProductPage[] = [
  {
    slug: 'seo',
    name: 'Klyna SEO',
    shortName: 'SEO',
    category: 'SEO audit app',
    primaryKeyword: 'Shopify SEO audit app',
    secondaryKeywords: [
      'Shopify SEO app',
      'Shopify SEO checker',
      'AI search readiness for Shopify',
    ],
    description:
      'Audit Shopify products, collections, pages, metadata, schema, links, images, and AI search readiness from one focused admin workspace.',
    hero: 'Find the SEO fixes that matter first.',
    answer:
      'Klyna SEO is a Shopify SEO audit app for merchants who need evidence-backed priorities. It checks product, collection, and content pages, groups issues by module, and keeps SEO work organized inside Shopify admin.',
    statusLabel: 'Published on the Shopify App Store',
    pricingNote: 'Growth plan: $29/month with a 7-day free trial on Shopify.',
    scoreLabel: 'Store score',
    ogImage: '/shopify-apps/klyna-seo/hero.jpg',
    ogImageAlt: 'Klyna SEO dashboard showing SEO score and audit modules',
    screenshotImage: '/shopify-apps/klyna-seo/dashboard.jpg',
    screenshotAlt: 'Klyna SEO dashboard inside Shopify admin',
    appStoreUrl: 'https://apps.shopify.com/klyna-seo-clean',
    metrics: [
      { label: 'Audit modules', value: '11' },
      { label: 'Page types', value: '3+' },
      { label: 'Primary action', value: 'Prioritize' },
    ],
    features: [
      {
        title: 'Page-level audit evidence',
        body: 'Review titles, descriptions, headings, images, links, schema, canonicals, keyword signals, and AI-search readiness by real Shopify URL.',
      },
      {
        title: 'Prioritized fix queue',
        body: 'Separate high-impact work from cleanup noise so teams can start with pages and templates that affect search visibility most.',
      },
      {
        title: 'AI-search readiness',
        body: 'Check whether product and collection pages expose clear entities, answerable copy, structured data, and crawlable internal context.',
      },
      {
        title: 'Embedded Shopify workflow',
        body: 'Run audits and review recommendations inside Shopify admin instead of exporting every issue into a separate SEO spreadsheet.',
      },
    ],
    workflow: [
      {
        title: 'Scan the store',
        body: 'Start with products, collections, and content pages rather than only the homepage.',
      },
      {
        title: 'Open the evidence',
        body: 'Use the issue, page, field, and module behind each warning before changing content.',
      },
      {
        title: 'Fix by leverage',
        body: 'Prioritize template-level or revenue-page improvements before low-value cosmetic cleanup.',
      },
      {
        title: 'Recheck and record',
        body: 'Keep the before/after state available for search, agency, and internal review.',
      },
    ],
    useCases: [
      'A store has many products and no clear order for SEO fixes.',
      'A migration, redesign, or app stack change may have changed metadata or schema.',
      'A team wants AI-search and answer-engine readiness without unsupported guarantees.',
      'An agency needs a repeatable audit view inside Shopify admin.',
    ],
    proofPoints: [
      'Published Shopify listing includes SEO score, audits, keyword analysis, speed analysis, and link analysis categories.',
      'Uses product, online store, and custom data permissions for the listed audit workflow.',
      'Matches existing Klyna blog clusters around Shopify SEO, schema, AI search, and store audits.',
    ],
    comparison: [
      {
        title: 'Versus image-only SEO apps',
        body: 'Klyna SEO covers metadata, headings, links, schema, canonical signals, keywords, and AI-search readiness, not only image compression.',
      },
      {
        title: 'Versus manual spreadsheets',
        body: 'The dashboard keeps findings tied to Shopify pages and modules so the next action is easier to review.',
      },
    ],
    limits: [
      'No SEO app can guarantee rankings, indexing, rich results, AI citations, or revenue.',
      'Search Console, analytics, and editorial judgment still matter after an audit.',
      'Bulk edits should be previewed and documented before publishing.',
    ],
    relatedLinks: [
      {
        label: 'Shopify SEO audit app checklist',
        href: '/blog/shopify-seo-audit-tool-app-store-checklist',
      },
      {
        label: 'AI Overview product page format',
        href: '/blog/shopify-ai-overview-product-page-format',
      },
      ...sharedRelatedLinks,
    ],
    faq: [
      {
        question: 'Does Shopify already handle SEO?',
        answer:
          'Shopify handles important foundations such as sitemaps, robots files, SSL, and canonical tags. Merchants still need to review metadata, content, headings, links, images, schema output, redirects, and app-related issues.',
      },
      {
        question: 'What should merchants fix first?',
        answer:
          'Fix issues attached to important products, collections, templates, and crawl paths before chasing a perfect score.',
      },
      {
        question: 'Can Klyna SEO guarantee AI search visibility?',
        answer:
          'No. It improves readiness signals and makes issues visible, but no app can guarantee inclusion in AI answers.',
      },
    ],
  },
  {
    slug: 'bundles',
    name: 'Klyna Bundles',
    shortName: 'Bundles',
    category: 'Product bundle app',
    primaryKeyword: 'Shopify bundle app',
    secondaryKeywords: [
      'Shopify quantity breaks',
      'mix and match bundle app',
      'Shopify volume discounts',
    ],
    description:
      'Create fixed bundles, mix-and-match offers, and quantity-break tiers using Shopify products, theme blocks, and native automatic discounts.',
    hero: 'Launch bundle offers without checkout surprises.',
    answer:
      'Klyna Bundles is a Shopify bundle app for fixed offers, mix-and-match product bundles, and quantity breaks. It uses a theme app block for presentation and Shopify-native automatic discounts for savings.',
    statusLabel: 'Published on the Shopify App Store',
    pricingNote:
      'Free Starter plan, Growth at $9.99/month, Pro at $19.99/month with trials on paid plans.',
    scoreLabel: 'Offer readiness',
    ogImage: '/shopify-apps/klyna-bundles/hero.jpg',
    ogImageAlt: 'Klyna Bundles product bundle and quantity break builder',
    screenshotImage: '/shopify-apps/klyna-bundles/dashboard.jpg',
    screenshotAlt: 'Klyna Bundles dashboard inside Shopify admin',
    appStoreUrl: 'https://apps.shopify.com/klyna-bundles',
    metrics: [
      { label: 'Offer types', value: '3' },
      { label: 'Theme code edits', value: '0' },
      { label: 'Discount path', value: 'Native' },
    ],
    features: [
      {
        title: 'Fixed and mix-and-match bundles',
        body: 'Create product offers from the catalog and match the offer type to how customers actually choose items.',
      },
      {
        title: 'Quantity-break tiers',
        body: 'Set volume tiers for offers where buying more should clearly change the saving.',
      },
      {
        title: 'Theme app block',
        body: 'Place bundle offers on product pages without pasting custom snippets into a live theme.',
      },
      {
        title: 'Native automatic discounts',
        body: 'Keep the storefront promise connected to Shopify discount behavior at checkout.',
      },
    ],
    workflow: [
      {
        title: 'Define the offer',
        body: 'Choose fixed bundle, mix-and-match, or quantity break before building anything.',
      },
      { title: 'Select products', body: 'Attach the offer to real Shopify products and variants.' },
      {
        title: 'Set the saving',
        body: 'Use automatic discounts and test eligible and ineligible carts.',
      },
      {
        title: 'Publish the block',
        body: 'Add the theme block and check product page, cart, and checkout behavior.',
      },
    ],
    useCases: [
      'A merchant wants a product-page bundle without a custom theme edit.',
      'A store needs quantity breaks for consumables, packs, or reorder products.',
      'A brand wants to test bundled merchandising before committing to custom development.',
      'An agency needs a clean QA path for discount and theme behavior.',
    ],
    proofPoints: [
      'Published listing is categorized under product bundles and quantity/volume discount features.',
      'App Store description emphasizes fixed bundles, mix-and-match offers, and quantity breaks.',
      'The pricing page exposes a free plan, which supports low-friction trial intent.',
    ],
    comparison: [
      {
        title: 'Versus single-purpose bundle apps',
        body: 'Klyna Bundles keeps fixed bundles, mix-and-match offers, and quantity breaks in one focused app.',
      },
      {
        title: 'Versus custom theme snippets',
        body: 'Theme app blocks are easier to place, remove, and QA than hardcoded snippets.',
      },
    ],
    limits: [
      'Bundle apps do not remove the need to check margin, taxes, shipping, returns, and inventory.',
      'Subscription, preorder, POS, and custom cart compatibility should be tested for each store.',
      'Higher order value is not guaranteed; measure incremental margin and conversion.',
    ],
    relatedLinks: [
      { label: 'Shopify bundle app guide', href: '/blog/shopify-bundle-app-guide' },
      {
        label: 'Quantity breaks vs product bundles',
        href: '/blog/quantity-breaks-vs-product-bundles-shopify',
      },
      ...sharedRelatedLinks,
    ],
    faq: [
      {
        question: 'Does Shopify require an app for bundles?',
        answer:
          'Yes. Shopify says stores need a bundles app for product bundles. First-party and third-party options differ by bundle type and compatibility.',
      },
      {
        question: 'What is the difference between a bundle and a quantity break?',
        answer:
          'A bundle groups related products into an offer. A quantity break changes the saving as the customer buys more units.',
      },
      {
        question: 'Can Klyna Bundles guarantee a higher AOV?',
        answer:
          'No. Bundles can support larger baskets, but product fit, presentation, margin, traffic, and checkout behavior determine the outcome.',
      },
    ],
  },
  {
    slug: 'reviews',
    name: 'Klyna Reviews',
    shortName: 'Reviews',
    category: 'Product reviews app',
    primaryKeyword: 'Shopify product reviews app',
    secondaryKeywords: [
      'Shopify photo reviews',
      'Shopify review schema',
      'product rating app for Shopify',
    ],
    description:
      'Collect star and photo reviews, moderate submissions, publish replies, track rating trends, and output product-rating structured data.',
    hero: 'Turn customer feedback into buyer confidence.',
    answer:
      'Klyna Reviews is a Shopify product reviews app for star ratings, photo reviews, merchant replies, moderation, rating trends, and Product/AggregateRating structured data.',
    statusLabel: 'Published on the Shopify App Store',
    pricingNote:
      'Free plan for smaller review volume; Growth plan at $12.99/month with a 7-day trial.',
    scoreLabel: 'Review health',
    ogImage: '/shopify-apps/klyna-reviews/hero.jpg',
    ogImageAlt: 'Klyna Reviews moderation and product rating dashboard',
    screenshotImage: '/shopify-apps/klyna-reviews/dashboard.jpg',
    screenshotAlt: 'Klyna Reviews moderation and rating trend dashboard',
    appStoreUrl: 'https://apps.shopify.com/klyna-reviews',
    metrics: [
      { label: 'Review types', value: 'Text + photo' },
      { label: 'Moderation', value: 'Built in' },
      { label: 'Schema', value: 'Product' },
    ],
    features: [
      {
        title: 'Storefront collection block',
        body: 'Collect product-specific star ratings, text reviews, and photo submissions through a theme app block.',
      },
      {
        title: 'Moderation queue',
        body: 'Approve, reject, flag spam, and publish merchant replies before reviews appear publicly.',
      },
      {
        title: 'Rating trends',
        body: 'Review distribution and trends help merchants spot products that need attention.',
      },
      {
        title: 'Structured ratings',
        body: 'Output Product and AggregateRating data from visible published reviews for eligible search engines.',
      },
    ],
    workflow: [
      {
        title: 'Place the block',
        body: 'Add the review block to product pages and verify spacing on mobile.',
      },
      {
        title: 'Collect test reviews',
        body: 'Submit text and photo reviews and confirm product association.',
      },
      {
        title: 'Moderate deliberately',
        body: 'Approve legitimate content, reject spam, and use replies for context.',
      },
      {
        title: 'Check markup',
        body: 'Confirm rating schema matches visible published reviews and does not duplicate another app.',
      },
    ],
    useCases: [
      'A new store needs a simple, visible review system.',
      'A merchant wants photo reviews without a heavy review-suite migration.',
      'A team needs to prevent review schema duplication after changing apps.',
      'A brand wants replies and moderation before public display.',
    ],
    proofPoints: [
      'Published listing includes photo reviews, star ratings, rich snippets, and forms feature categories.',
      'The app uses Shopify product permissions for review display and structured data.',
      'Klyna already has supporting content around review schema, migration, and selection risks.',
    ],
    comparison: [
      {
        title: 'Versus giant review platforms',
        body: 'Klyna Reviews is focused on product review collection, moderation, replies, and schema rather than broad loyalty or syndication suites.',
      },
      {
        title: 'Versus schema-only widgets',
        body: 'The app connects ratings to visible review content instead of treating markup as the product.',
      },
    ],
    limits: [
      'Review rich results are never guaranteed by structured data alone.',
      'Do not use moderation to misrepresent legitimate customer feedback.',
      'Large historical migrations should be validated before switching review providers.',
    ],
    relatedLinks: [
      {
        label: 'Shopify product reviews app guide',
        href: '/blog/shopify-product-reviews-app-guide',
      },
      {
        label: 'Review app migration SEO checklist',
        href: '/blog/shopify-review-app-migration-seo-checklist',
      },
      ...sharedRelatedLinks,
    ],
    faq: [
      {
        question: 'Will review schema guarantee stars in Google?',
        answer:
          'No. Accurate visible markup can support eligibility, but Google decides when review snippets appear.',
      },
      {
        question: 'Should every review publish automatically?',
        answer:
          'Not always. Moderation should remove spam, abuse, and irrelevant submissions without manufacturing sentiment.',
      },
      {
        question: 'What should be checked before replacing a review app?',
        answer:
          'Check exports, photos, product matching, dates, widget removal, schema duplication, and review visibility.',
      },
    ],
  },
  {
    slug: 'back-in-stock',
    name: 'Klyna Back-in-Stock',
    shortName: 'Back-in-Stock',
    category: 'Restock alert app',
    primaryKeyword: 'Shopify back in stock app',
    secondaryKeywords: [
      'Shopify restock alerts',
      'notify me when back in stock Shopify',
      'variant waitlist app',
    ],
    description:
      'Capture sold-out variant waitlists, rank demand, and send restock alerts when inventory returns.',
    hero: 'Turn sold-out demand into a ranked restock plan.',
    answer:
      'Klyna Back-in-Stock is a Shopify restock alert app for variant waitlists, demand ranking, CSV exports, resend controls, and automatic email alerts when inventory is sellable again.',
    statusLabel: 'Published on the Shopify App Store',
    pricingNote:
      'Free plan available on Shopify; paid plan details should be checked on the live listing.',
    scoreLabel: 'Demand signal',
    ogImage: '/shopify-apps/klyna-back-in-stock/hero.jpg',
    ogImageAlt: 'Klyna Back-in-Stock waitlist and restock alert workflow',
    screenshotImage: '/shopify-apps/klyna-back-in-stock/dashboard.jpg',
    screenshotAlt: 'Klyna Back-in-Stock demand dashboard inside Shopify admin',
    appStoreUrl: 'https://apps.shopify.com/klyna-back-in-stock',
    metrics: [
      { label: 'Capture level', value: 'Variant' },
      { label: 'Demand report', value: 'Ranked' },
      { label: 'Alerts', value: 'Email' },
    ],
    features: [
      {
        title: 'Variant-aware waitlists',
        body: 'Capture interest for the exact sold-out size, color, or configuration shoppers requested.',
      },
      {
        title: 'Demand ranking',
        body: 'Group waiters by product and variant so replenishment planning has a clearer signal.',
      },
      {
        title: 'Restock alerts',
        body: 'Send shoppers back to the product when inventory is available again.',
      },
      {
        title: 'Exports and controls',
        body: 'Filter, re-arm, export, and review subscriber lists instead of leaving waitlist data buried.',
      },
    ],
    workflow: [
      {
        title: 'Detect the stockout',
        body: 'Show the form when the selected variant cannot be bought.',
      },
      {
        title: 'Capture intent',
        body: 'Store the requested variant, email, timestamp, and source context.',
      },
      {
        title: 'Trigger on sellable inventory',
        body: 'Alert when inventory returns in a way customers can act on.',
      },
      {
        title: 'Measure demand',
        body: 'Use waiters, sent alerts, visits, and orders as separate signals.',
      },
    ],
    useCases: [
      'A store often sells out specific sizes, colors, or packs.',
      'A buying team needs a signal before reordering inventory.',
      'A merchant wants a store-owned waitlist rather than only platform-side saved-product alerts.',
      'A team wants exportable evidence of missed demand.',
    ],
    proofPoints: [
      'Live Shopify listing metadata describes waitlists, demand ranking, and automatic restock alerts.',
      'Klyna blog content already targets restock alert app selection, conversion paths, and event tracking.',
      'The workflow avoids claiming guaranteed recovery from waitlist volume alone.',
    ],
    comparison: [
      {
        title: 'Versus product-level notify forms',
        body: 'Variant-level capture gives cleaner demand data and reduces irrelevant alerts.',
      },
      {
        title: 'Versus accepting backorders',
        body: 'A waitlist measures interest without taking orders the store cannot yet fulfill.',
      },
    ],
    limits: [
      'A waitlist measures interest, not guaranteed purchases.',
      'Deliverability, consent language, and resend controls affect alert quality.',
      'Inventory setup must be accurate for useful triggers.',
    ],
    relatedLinks: [
      { label: 'Back-in-stock app checklist', href: '/blog/shopify-restock-alert-app-checklist' },
      { label: 'Restock alert event tracking', href: '/blog/shopify-restock-alert-event-tracking' },
      ...sharedRelatedLinks,
    ],
    faq: [
      {
        question: 'Should restock capture be product-level or variant-level?',
        answer:
          'Variant-level capture is usually stronger because shoppers often want a specific size, color, or configuration.',
      },
      {
        question: 'When should a restock alert send?',
        answer:
          'Send when the requested variant has sellable inventory and the customer can reasonably complete the purchase.',
      },
      {
        question: 'Does a waitlist predict purchases?',
        answer:
          'It predicts interest. Compare waiters, alert delivery, clicks, purchases, and unsubscribes before using it for buying decisions.',
      },
    ],
  },
  {
    slug: 'redirect-guard',
    name: 'Klyna Redirect Guard',
    shortName: 'Redirect Guard',
    category: 'Redirect monitor app',
    primaryKeyword: 'Shopify redirect monitor',
    secondaryKeywords: [
      'Shopify broken link checker',
      'deleted product redirects',
      'Shopify 404 redirect app',
    ],
    description:
      'Catch broken storefront URLs, deleted products, weak redirect coverage, and migration gaps before organic traffic leaks.',
    hero: 'Protect search traffic through every catalog change.',
    answer:
      'Klyna Redirect Guard is a Shopify redirect monitoring app for catalog cleanup, product deletions, migrations, 404 checks, redirect coverage, scan history, and exportable evidence.',
    statusLabel: 'Published on the Shopify App Store',
    pricingNote:
      'Free trial available on Shopify; check the live listing for current plan details.',
    scoreLabel: 'URL safety',
    ogImage: '/shopify-apps/klyna-redirect-guard/hero.jpg',
    ogImageAlt: 'Klyna Redirect Guard redirect coverage and broken URL monitor',
    screenshotImage: '/shopify-apps/klyna-redirect-guard/dashboard.jpg',
    screenshotAlt: 'Klyna Redirect Guard redirect audit findings in Shopify admin',
    appStoreUrl: 'https://apps.shopify.com/klyna-redirect-guard',
    metrics: [
      { label: 'URL types', value: '3+' },
      { label: 'History', value: 'Saved' },
      { label: 'Action', value: 'Fix queue' },
    ],
    features: [
      {
        title: 'Live URL sampling',
        body: 'Check product, collection, page, article, and storefront URLs that can change during everyday catalog work.',
      },
      {
        title: 'Redirect coverage review',
        body: 'Compare deleted or risky paths against Shopify URL redirects before shoppers and crawlers hit dead ends.',
      },
      {
        title: 'Scan history',
        body: 'Keep evidence across migrations, theme changes, product imports, and pruning cycles.',
      },
      {
        title: 'CSV evidence',
        body: 'Export findings so agencies and store teams can handle fixes with a clear record.',
      },
    ],
    workflow: [
      {
        title: 'Run a baseline',
        body: 'Scan before deleting products, changing handles, or launching a migration.',
      },
      {
        title: 'Review failed paths',
        body: 'Separate true broken URLs from expected unavailable pages.',
      },
      {
        title: 'Create safe redirects',
        body: 'Map removed URLs to live canonical destinations, not generic homepages.',
      },
      {
        title: 'Recheck after launch',
        body: 'Confirm changed URLs resolve and redirect chains stay direct.',
      },
    ],
    useCases: [
      'After deleting or hiding products with historical traffic.',
      'During WooCommerce, Webflow, Wix, or custom-store migrations to Shopify.',
      'Before changing collection handles, menus, or campaign landing pages.',
      'After bulk imports from vendors, ERPs, or dropshipping catalogs.',
    ],
    proofPoints: [
      'Published listing targets redirect gaps before catalog changes hurt SEO traffic.',
      'App Store data access is scoped around products, content, and online store resources needed for URL monitoring.',
      'Klyna has supporting redirect-chain, migration, and Search Console indexing content.',
    ],
    comparison: [
      {
        title: 'Versus checking Search Console late',
        body: 'Redirect Guard is designed to find risks before traffic and crawlers repeatedly hit broken paths.',
      },
      {
        title: 'Versus generic broken link tools',
        body: 'The workflow is built around Shopify catalog objects, URL redirects, and merchant migration tasks.',
      },
    ],
    limits: [
      'Redirects cannot recover traffic if the destination is irrelevant or unavailable.',
      'Redirect maps should stay direct, small, and tied to canonical live URLs.',
      'The app does not promise ranking recovery after migrations.',
    ],
    relatedLinks: [
      { label: 'Shopify redirect monitoring app', href: '/blog/shopify-redirect-monitoring-app' },
      {
        label: 'Redirect chain after app uninstall',
        href: '/blog/shopify-redirect-chain-after-app-uninstall',
      },
      ...sharedRelatedLinks,
    ],
    faq: [
      {
        question: 'When should redirects be checked?',
        answer:
          'Check before and after product deletions, handle changes, migrations, theme launches, and bulk catalog imports.',
      },
      {
        question: 'Should every deleted product redirect to the homepage?',
        answer:
          'No. Redirect removed URLs to the closest useful live product, collection, guide, or support page.',
      },
      {
        question: 'Can redirects guarantee SEO recovery?',
        answer:
          'No. Good redirects reduce avoidable loss, but relevance, crawl timing, site quality, and demand still affect results.',
      },
    ],
  },
  {
    slug: 'feed-doctor',
    name: 'Klyna Feed Doctor',
    shortName: 'Feed Doctor',
    category: 'Catalog feed diagnostic app',
    primaryKeyword: 'Shopify product feed audit',
    secondaryKeywords: [
      'Google Merchant Center product feed issues',
      'Shopify missing GTIN checker',
      'catalog readiness app',
    ],
    description:
      'Find missing product identifiers, SKUs, images, vendors, metadata, and variant-level catalog issues before channel rejection.',
    hero: 'Fix product feed issues before channels reject them.',
    answer:
      'Klyna Feed Doctor is a Shopify catalog readiness app that scans sampled products and variants for feed issues, saves scan history, and exports CSV cleanup reports.',
    statusLabel: 'Published on the Shopify App Store',
    pricingNote: 'Free plan available; Pro at $9/month with a 7-day trial on Shopify.',
    scoreLabel: 'Feed readiness',
    appStoreUrl: 'https://apps.shopify.com/klyna-feed-doctor',
    metrics: [
      { label: 'Catalog checks', value: '5+' },
      { label: 'Variant review', value: 'Yes' },
      { label: 'Exports', value: 'CSV' },
    ],
    features: [
      {
        title: 'Product and variant checks',
        body: 'Review sampled products and variants for missing identifiers, SKUs, images, vendors, and metadata.',
      },
      {
        title: 'Merchant Center readiness',
        body: 'Create a cleanup backlog before channel apps, Shopping feeds, and marketplace feeds amplify bad data.',
      },
      {
        title: 'Saved scan history',
        body: 'Track whether catalog hygiene is improving after imports, vendor updates, or merchandising passes.',
      },
      {
        title: 'CSV cleanup reports',
        body: 'Export evidence for operators, agencies, or VAs who will fix fields in Shopify.',
      },
    ],
    workflow: [
      {
        title: 'Sample the catalog',
        body: 'Scan enough products and variants to see repeated field gaps.',
      },
      {
        title: 'Group the issue',
        body: 'Separate GTIN, SKU, vendor, image, and SEO metadata work.',
      },
      {
        title: 'Export the queue',
        body: 'Turn findings into a CSV task list instead of switching feed tools immediately.',
      },
      {
        title: 'Recheck after cleanup',
        body: 'Use the next scan to verify that product data is moving in the right direction.',
      },
    ],
    useCases: [
      'A merchant is preparing for Google Merchant Center or marketplace feed review.',
      'A store imported products from vendors, dropshippers, or spreadsheets.',
      'Shopping campaigns are limited by avoidable product data gaps.',
      'An agency needs a clear data hygiene report before feed-tool work.',
    ],
    proofPoints: [
      'Published listing mentions missing identifiers, SKUs, images, vendors, metadata, scan history, and CSV cleanup reports.',
      'App Store category currently places the app in analytics/data export style discovery surfaces.',
      'Klyna has supporting feed quality, Merchant Center, and product data content clusters.',
    ],
    comparison: [
      {
        title: 'Versus a full feed generator',
        body: "Feed Doctor focuses on diagnosis and cleanup readiness before replacing the merchant's current feed stack.",
      },
      {
        title: 'Versus manual CSV review',
        body: 'The app ties product data gaps to Shopify products and variants before work leaves the admin.',
      },
    ],
    limits: [
      'The app does not guarantee Merchant Center approval.',
      'Policy, landing page, shipping, tax, and account issues can still block products.',
      'Some identifiers are category-specific and may require supplier or manufacturer data.',
    ],
    relatedLinks: [
      { label: 'Shopify feed quality checklist', href: '/blog/shopify-feed-quality-checklist' },
      { label: 'Product feed SEO diagnostics', href: '/blog/shopify-product-feed-seo-diagnostics' },
      ...sharedRelatedLinks,
    ],
    faq: [
      {
        question: 'Does Feed Doctor replace a feed app?',
        answer:
          'No. It is a catalog diagnostic and cleanup workflow that can improve data quality before feed publishing.',
      },
      {
        question: 'Why are GTINs and SKUs important?',
        answer:
          'Identifiers help channels understand and match products. Missing or incorrect fields can limit visibility or trigger review issues.',
      },
      {
        question: 'Can a product feed audit guarantee channel approval?',
        answer:
          'No. It reduces avoidable product data issues but cannot control platform policy decisions.',
      },
    ],
  },
  {
    slug: 'cleanroom',
    name: 'Klyna Cleanroom',
    shortName: 'Cleanroom',
    category: 'Theme cleanup diagnostic app',
    primaryKeyword: 'remove leftover Shopify app code',
    secondaryKeywords: [
      'Shopify theme cleanup',
      'duplicate tracking checker Shopify',
      'leftover app scripts Shopify',
    ],
    description:
      'Scan storefront pages for leftover app signatures, external scripts, duplicate tracking sources, and cleanup risks before editing a theme.',
    hero: 'Remove storefront residue with evidence first.',
    answer:
      'Klyna Cleanroom is a Shopify theme cleanup diagnostic app for finding leftover app code, external scripts, duplicate tracking, scan history, and cleanup evidence before theme edits.',
    statusLabel: 'Published on the Shopify App Store',
    pricingNote:
      'Free plan includes limited manual debris scans; Pro at $9/month with a 7-day trial on Shopify.',
    scoreLabel: 'Debris score',
    appStoreUrl: 'https://apps.shopify.com/klyna-cleanroom',
    metrics: [
      { label: 'Scan target', value: 'Storefront' },
      { label: 'Cleanup mode', value: 'Guarded' },
      { label: 'History', value: 'Saved' },
    ],
    features: [
      {
        title: 'Leftover app signatures',
        body: 'Scan sampled storefront pages for script, widget, review, subscription, page-builder, and tracking residue.',
      },
      {
        title: 'Duplicate tracker warnings',
        body: 'Flag possible duplicate Meta, Google, TikTok, Pinterest, and other marketing tags.',
      },
      {
        title: 'Evidence before edits',
        body: 'Show findings, source URLs, and cleanup notes before any developer touches a live theme.',
      },
      {
        title: 'History and CSV evidence',
        body: 'Document before/after states for theme cleanup, app removals, and performance work.',
      },
    ],
    workflow: [
      {
        title: 'Scan sampled pages',
        body: 'Start with homepage, product, collection, and content templates.',
      },
      {
        title: 'Identify residue',
        body: 'Separate current app scripts from old, duplicate, or unexplained code.',
      },
      {
        title: 'Back up before work',
        body: 'Use a duplicate theme, preview, and rollback plan for any removal.',
      },
      {
        title: 'Recheck after cleanup',
        body: 'Confirm scripts, widgets, and trackers changed as expected.',
      },
    ],
    useCases: [
      'A store has installed and removed many apps over time.',
      'A speed project needs evidence before theme editing.',
      'A merchant sees duplicate tracking or confusing app output.',
      'An agency needs a cleanup report before changing production theme code.',
    ],
    proofPoints: [
      'Published listing includes leftover app signatures, external scripts, duplicate tracking, scan history, and CSV evidence.',
      'The public listing explicitly says the app does not edit the live theme during diagnostics.',
      'The app matches Klyna safety positioning around app stack and performance audits.',
    ],
    comparison: [
      {
        title: 'Versus blind theme edits',
        body: 'Cleanroom gives evidence, backup language, and review steps before removal work starts.',
      },
      {
        title: 'Versus generic speed apps',
        body: 'The product focuses on old app residue and tracking duplication, not broad compression promises.',
      },
    ],
    limits: [
      'Theme cleanup should be done on a duplicate theme with rollback.',
      'Some app code is required for current workflows and should not be removed blindly.',
      'The app does not guarantee Core Web Vitals improvements from cleanup alone.',
    ],
    relatedLinks: [
      { label: 'Leftover app code cleanup', href: '/blog/shopify-leftover-app-code-cleanup' },
      {
        label: 'App uninstall cleanup checklist',
        href: '/blog/shopify-app-uninstall-cleanup-checklist',
      },
      ...sharedRelatedLinks,
    ],
    faq: [
      {
        question: 'Does Cleanroom edit the live theme automatically?',
        answer:
          'No. The published app is diagnostic-first. It shows evidence and cleanup guidance before edits.',
      },
      {
        question: 'What counts as leftover app code?',
        answer:
          'Common examples include old widgets, hardcoded snippets, app-block residue, duplicate pixels, and scripts from tools no longer used.',
      },
      {
        question: 'Can cleanup guarantee faster pages?',
        answer:
          'No. Removing unused scripts can reduce risk, but speed depends on theme code, media, apps, hosting, and page composition.',
      },
    ],
  },
  {
    slug: 'promo-qa',
    name: 'Klyna Promo QA',
    shortName: 'Promo QA',
    category: 'Discount QA app',
    primaryKeyword: 'Shopify discount testing app',
    secondaryKeywords: [
      'Shopify discount conflict checker',
      'promotion QA Shopify',
      'automatic discount testing',
    ],
    description:
      'Preflight Shopify discounts, automatic campaigns, free shipping, expiry dates, and combine-rule risks before traffic hits checkout.',
    hero: 'Catch discount conflicts before campaigns go live.',
    answer:
      'Klyna Promo QA is a Shopify promotion quality-assurance app for checking active discounts, expiry risk, combine rules, campaign readiness, and team QA records.',
    statusLabel: 'Submission follow-up app',
    pricingNote: 'Listing availability depends on Shopify review status.',
    scoreLabel: 'Promo score',
    metrics: [
      { label: 'Discount types', value: 'Code + auto' },
      { label: 'Risk checks', value: '4+' },
      { label: 'Use case', value: 'Launch QA' },
    ],
    features: [
      {
        title: 'Active discount review',
        body: 'Review automatic and code discounts before a campaign is promoted.',
      },
      {
        title: 'Expiry and overlap checks',
        body: 'Flag missing end dates, overlapping campaigns, and non-combinable rules.',
      },
      {
        title: 'Campaign QA record',
        body: 'Create a clearer handoff for launch teams and agencies.',
      },
      {
        title: 'Scenario-first workflow',
        body: 'Focus on whether customers will see the expected offer at checkout.',
      },
    ],
    workflow: [
      {
        title: 'Load active campaigns',
        body: 'Pull current code and automatic discounts from Shopify.',
      },
      {
        title: 'Flag collisions',
        body: 'Check dates, combine rules, discount types, and campaign overlap.',
      },
      {
        title: 'Test scenarios',
        body: 'Review eligible and ineligible carts before traffic starts.',
      },
      { title: 'Save QA evidence', body: 'Keep a record of launch-readiness checks for the team.' },
    ],
    useCases: [
      'Before BFCM, Eid, Christmas, or flash-sale campaigns.',
      'Before influencer, affiliate, or paid ad traffic starts.',
      'When free shipping and product discounts need to work together.',
      'When support tickets often come from discount-code confusion.',
    ],
    proofPoints: [
      'The product is positioned as QA, not another discount builder.',
      'Klyna already has supporting discount conflict and promotion QA content.',
      'The workflow avoids unsupported promises about discount stacking.',
    ],
    comparison: [
      {
        title: 'Versus building more discounts',
        body: 'Promo QA checks campaign behavior before launch rather than adding another promotion layer.',
      },
      {
        title: 'Versus manual launch checklists',
        body: 'The app ties discount data to repeatable scenarios and saved evidence.',
      },
    ],
    limits: [
      'It cannot make Shopify combine discounts in unsupported ways.',
      'Pricing, market, subscription, and checkout app behavior still need store-specific testing.',
      'Promotion margin must be checked outside the app if COGS data is not available.',
    ],
    relatedLinks: [
      { label: 'Shopify promo QA checklist', href: '/blog/shopify-promo-qa-checklist' },
      { label: 'Bundle discount conflicts', href: '/blog/bundle-app-shopify-discount-conflicts' },
      ...sharedRelatedLinks,
    ],
    faq: [
      {
        question: 'Is Promo QA a discount builder?',
        answer: 'No. It is designed to check active campaign risk and launch readiness.',
      },
      {
        question: 'What does a discount collision mean?',
        answer:
          'A collision is when two offers overlap, fail to combine, expire unexpectedly, or produce a different checkout result than the campaign promised.',
      },
      {
        question: 'Can the app override Shopify discount rules?',
        answer:
          'No. It should expose rule behavior clearly, not claim unsupported checkout behavior.',
      },
    ],
  },
  {
    slug: 'pixel-doctor',
    name: 'Klyna Pixel Doctor',
    shortName: 'Pixel Doctor',
    category: 'Tracking diagnostic app',
    primaryKeyword: 'Shopify duplicate pixel checker',
    secondaryKeywords: [
      'duplicate purchase events Shopify',
      'Shopify tracking diagnostics',
      'Shopify consent timing checker',
    ],
    description:
      'Detect duplicate Meta, Google, TikTok, Pinterest, and consent timing risks from the live storefront.',
    hero: 'Find tracking gaps before paid traffic scales.',
    answer:
      'Klyna Pixel Doctor is a Shopify tracking diagnostic app for duplicate pixels, marketing tags, hardcoded tracking residue, and consent timing signals on storefront pages.',
    statusLabel: 'Submission follow-up app',
    pricingNote: 'Listing availability depends on Shopify review status.',
    scoreLabel: 'Tracking score',
    metrics: [
      { label: 'Platforms', value: 'Meta+' },
      { label: 'Scan mode', value: 'Storefront' },
      { label: 'Focus', value: 'Duplicates' },
    ],
    features: [
      {
        title: 'Marketing tag detection',
        body: 'Scan storefront HTML for common Meta, Google, TikTok, Pinterest, affiliate, and analytics markers.',
      },
      {
        title: 'Duplicate source warnings',
        body: 'Flag cases where theme code, customer events, pixels, and apps may overlap.',
      },
      {
        title: 'Consent timing hints',
        body: 'Look for consent and privacy API markers near marketing scripts.',
      },
      {
        title: 'Cleanup checklist',
        body: 'Turn findings into an agency-friendly tracking cleanup workflow.',
      },
    ],
    workflow: [
      {
        title: 'Scan storefront pages',
        body: 'Check product, collection, homepage, and checkout-adjacent templates where possible.',
      },
      {
        title: 'Group by platform',
        body: 'Separate Meta, Google, TikTok, Pinterest, and consent findings.',
      },
      { title: 'Identify overlap', body: 'Look for duplicate sources before disabling anything.' },
      {
        title: 'Retest after cleanup',
        body: 'Confirm the expected tags remain and obvious duplicates are gone.',
      },
    ],
    useCases: [
      'Meta or Google reports duplicate purchases.',
      'A store installed a new ads, affiliate, reviews, or analytics app.',
      'Customer Events and theme pixels may overlap.',
      'A merchant wants a cleanup pass before scaling ad spend.',
    ],
    proofPoints: [
      'The product avoids ad-account OAuth requirements for the basic diagnostic workflow.',
      'Klyna content already targets duplicate purchase events and storefront event QA.',
      'The value proposition is neutral diagnosis, not attribution guarantees.',
    ],
    comparison: [
      {
        title: 'Versus attribution dashboards',
        body: 'Pixel Doctor checks whether events may be duplicated before interpreting revenue attribution.',
      },
      {
        title: 'Versus manual source viewing',
        body: 'The app turns script and tag patterns into a repeatable report.',
      },
    ],
    limits: [
      'The app does not guarantee ad platform attribution accuracy.',
      'Consent and privacy compliance require legal and policy review.',
      'Some duplicate-looking tags may be intentional server/client setups and need verification.',
    ],
    relatedLinks: [
      { label: 'Shopify pixel QA checklist', href: '/blog/shopify-pixel-qa-checklist' },
      {
        label: 'Duplicate purchase event checklist',
        href: '/blog/shopify-pixel-duplicate-purchase-event-checklist',
      },
      ...sharedRelatedLinks,
    ],
    faq: [
      {
        question: 'Can Pixel Doctor access ad accounts?',
        answer: 'The basic diagnostic workflow does not require third-party ad account OAuth.',
      },
      {
        question: 'What causes duplicate purchase events?',
        answer:
          'Common causes include theme pixels, customer events, tag managers, hardcoded scripts, and apps firing the same platform event.',
      },
      {
        question: 'Can it certify compliance?',
        answer:
          'No. It can surface technical consent timing hints, but legal compliance needs separate review.',
      },
    ],
  },
];
