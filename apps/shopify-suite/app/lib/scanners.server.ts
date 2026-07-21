import type { Finding, Metric, ProductKey, ProductReport, Severity } from './products';
import type { ProductSnapshot, ShopSnapshot } from './shopify-data.server';

type StorefrontPage = {
  url: string;
  ok: boolean;
  status: number;
  html: string;
  error?: string;
};

const SCRIPT_SIGNATURES = [
  { app: 'Klaviyo', pattern: /klaviyo|klaviyo\.com/gi },
  { app: 'Loox', pattern: /loox|loox\.io/gi },
  { app: 'Judge.me', pattern: /judge\.me|judgeme/gi },
  { app: 'Yotpo', pattern: /yotpo/gi },
  { app: 'Stamped', pattern: /stamped\.io|stamped/gi },
  { app: 'Gorgias', pattern: /gorgias/gi },
  { app: 'Recharge', pattern: /rechargeapps|recharge/gi },
  { app: 'Bold', pattern: /boldapps|bold-common/gi },
  { app: 'PageFly', pattern: /pagefly|pf-custom/gi },
  { app: 'GemPages', pattern: /gempages|gem-page/gi },
  { app: 'Meta Pixel', pattern: /connect\.facebook\.net|fbq\(/gi },
  { app: 'Google tag', pattern: /googletagmanager\.com|gtag\(|google-analytics/gi },
  { app: 'TikTok Pixel', pattern: /analytics\.tiktok\.com|ttq\(/gi },
  { app: 'Hotjar', pattern: /hotjar|hj\(/gi },
];

const TRACKING_PLATFORMS = [
  { name: 'Meta', pattern: /connect\.facebook\.net|fbq\(/gi },
  { name: 'Google', pattern: /googletagmanager\.com|gtag\(|google-analytics/gi },
  { name: 'TikTok', pattern: /analytics\.tiktok\.com|ttq\(/gi },
  { name: 'Pinterest', pattern: /ct\.pinterest\.com|pintrk\(/gi },
  { name: 'Snapchat', pattern: /sc-static\.net|snaptr\(/gi },
];

export async function buildReport(
  productKey: ProductKey,
  snapshot: ShopSnapshot,
): Promise<ProductReport> {
  switch (productKey) {
    case 'cleanroom':
      return scanCleanroom(snapshot);
    case 'promo-qa':
      return scanPromoQa(snapshot);
    case 'redirect-guard':
      return scanRedirectGuard(snapshot);
    case 'pixel-doctor':
      return scanPixelDoctor(snapshot);
    case 'feed-doctor':
      return scanFeedDoctor(snapshot);
  }
}

async function scanCleanroom(snapshot: ShopSnapshot): Promise<ProductReport> {
  const pages = await fetchStorefrontPages(snapshot);
  const signatureHits = countSignatures(pages);
  const scripts = extractScripts(pages);
  const duplicateTrackers = duplicatePlatforms(pages);
  const staleHints = signatureHits.filter((hit) => hit.count >= 3);
  const findings: Finding[] = [];

  if (scripts.external > 35) {
    findings.push(
      issue(
        'cleanroom-heavy-script-stack',
        'warning',
        'Large storefront script stack',
        `${scripts.external} external scripts were found across sampled pages.`,
        'Review apps that inject storefront JavaScript and remove apps no longer in use.',
        `${scripts.external} external scripts`,
      ),
    );
  }

  for (const hit of staleHints.slice(0, 8)) {
    findings.push(
      issue(
        `cleanroom-${slug(hit.app)}`,
        'warning',
        `${hit.app} residue appears repeatedly`,
        `Klyna saw ${hit.count} ${hit.app} signatures across sampled HTML.`,
        'Confirm this app is still installed and used. If not, duplicate the theme and remove the related snippet/script references.',
        `${hit.count} matches`,
      ),
    );
  }

  for (const platform of duplicateTrackers) {
    findings.push(
      issue(
        `cleanroom-duplicate-${slug(platform.name)}`,
        'critical',
        `Possible duplicate ${platform.name} tracking`,
        `${platform.name} appeared ${platform.count} times in the sampled storefront HTML.`,
        'Map the source of each event before deleting anything. Remove old hardcoded pixels only after confirming a single supported integration remains.',
        `${platform.count} matches`,
      ),
    );
  }

  if (pages.some((page) => !page.ok)) {
    findings.push(
      issue(
        'cleanroom-fetch-errors',
        'info',
        'Some storefront pages could not be scanned',
        'A sampled storefront URL returned an error or blocked the scan.',
        'Open the page manually and run the scan again after confirming the storefront is public.',
      ),
    );
  }

  if (findings.length === 0) {
    findings.push(
      issue(
        'cleanroom-clean-start',
        'success',
        'No obvious app residue in sampled HTML',
        'Klyna did not find repeated app signatures or duplicate tracking in the sampled pages.',
        'Keep monitoring after uninstalling apps or publishing a new theme.',
      ),
    );
  }

  return report(
    'cleanroom',
    scoreFrom(findings, 92),
    'Theme debris scan completed.',
    [
      metric('Pages sampled', String(pages.length)),
      metric(
        'External scripts',
        String(scripts.external),
        scripts.external > 35 ? 'warning' : 'info',
      ),
      metric('App signatures', String(signatureHits.length)),
      metric(
        'Duplicate trackers',
        String(duplicateTrackers.length),
        duplicateTrackers.length ? 'critical' : 'success',
      ),
    ],
    findings,
  );
}

function scanPromoQa(snapshot: ShopSnapshot): ProductReport {
  const active = snapshot.discounts.filter((discount) => discount.status === 'ACTIVE');
  const noExpiry = active.filter((discount) => !discount.endsAt);
  const nonCombinable = active.filter((discount) => {
    const combines = discount.combinesWith;
    return (
      combines &&
      !combines.orderDiscounts &&
      !combines.productDiscounts &&
      !combines.shippingDiscounts
    );
  });
  const findings: Finding[] = [];

  if (active.length === 0) {
    findings.push(
      issue(
        'promo-no-active-discounts',
        'info',
        'No active discounts found',
        'Klyna did not find active automatic or code discounts in the Admin API sample.',
        'Create a test campaign, then rerun Promo QA before launch.',
      ),
    );
  }

  if (nonCombinable.length > 1) {
    findings.push(
      issue(
        'promo-non-combinable',
        'critical',
        'Multiple active discounts do not combine',
        `${nonCombinable.length} active discounts appear non-combinable. Customers may see only one discount at checkout.`,
        'Build cart scenarios for your top campaign products and document which discount wins before sending traffic.',
        nonCombinable.map((d) => d.title).join(', '),
      ),
    );
  }

  if (noExpiry.length > 0) {
    findings.push(
      issue(
        'promo-no-expiry',
        'warning',
        'Active discounts without end dates',
        `${noExpiry.length} active discounts have no end date.`,
        'Add campaign end dates or review reminders so old promos do not quietly stack with future campaigns.',
        noExpiry
          .map((d) => d.title)
          .slice(0, 5)
          .join(', '),
      ),
    );
  }

  if (active.some((discount) => /free shipping/i.test(discount.title))) {
    findings.push(
      issue(
        'promo-free-shipping',
        'info',
        'Free-shipping promo detected',
        'Free-shipping offers often conflict with order-value discounts or market-specific thresholds.',
        'Test carts below and above the shipping threshold for each target market.',
      ),
    );
  }

  if (findings.length === 0) {
    findings.push(
      issue(
        'promo-ready',
        'success',
        'No obvious promo collision in current sample',
        'The active discount sample did not show missing expiries or obvious combine-rule conflicts.',
        'Save a launch scenario before your next campaign.',
      ),
    );
  }

  return report(
    'promo-qa',
    scoreFrom(findings, 90),
    'Promotion rules reviewed.',
    [
      metric('Active discounts', String(active.length)),
      metric('No expiry', String(noExpiry.length), noExpiry.length ? 'warning' : 'success'),
      metric(
        'Non-combinable',
        String(nonCombinable.length),
        nonCombinable.length > 1 ? 'critical' : 'info',
      ),
      metric('Products sampled', String(snapshot.products.length)),
    ],
    appendWarnings(findings, snapshot.graphqlWarnings),
  );
}

async function scanRedirectGuard(snapshot: ShopSnapshot): Promise<ProductReport> {
  const urls = [
    ...snapshot.products.map((item) => item.onlineStoreUrl),
    ...snapshot.collections.map((item) => item.onlineStoreUrl),
    ...snapshot.pages.map((item) => item.onlineStoreUrl),
  ]
    .filter(Boolean)
    .slice(0, 12) as string[];
  const pages = await Promise.all(urls.map(fetchPage));
  const failures = pages.filter((page) => page.status >= 400 || !page.ok);
  const duplicateTargets = findDuplicateRedirectTargets(snapshot.redirects);
  const findings: Finding[] = [];

  if (
    snapshot.redirects.length === 0 &&
    snapshot.products.length + snapshot.collections.length > 20
  ) {
    findings.push(
      issue(
        'redirect-no-redirects',
        'warning',
        'No URL redirects found',
        'This store has catalog content but no sampled URL redirects.',
        'Before deleting or renaming products, create redirect coverage or monitor 404s immediately after publishing.',
      ),
    );
  }

  for (const page of failures.slice(0, 5)) {
    findings.push(
      issue(
        `redirect-failed-${slug(page.url)}`,
        'critical',
        'Sampled storefront URL failed',
        `${page.url} returned ${page.status || page.error || 'an error'}.`,
        'Create a redirect if this URL is indexed, linked from menus, or used in campaigns.',
        page.url,
      ),
    );
  }

  if (duplicateTargets.length > 0) {
    findings.push(
      issue(
        'redirect-duplicate-targets',
        'info',
        'Several redirects point to the same target',
        `${duplicateTargets.length} targets receive multiple redirects.`,
        'Review whether these redirects came from a migration and whether the destination is still the best canonical page.',
      ),
    );
  }

  if (findings.length === 0) {
    findings.push(
      issue(
        'redirect-ready',
        'success',
        'Sampled URLs and redirects look stable',
        'The sampled live URLs responded and Klyna did not find obvious redirect map risks.',
        'Turn on monitoring before migrations, theme changes, or catalog pruning.',
      ),
    );
  }

  return report(
    'redirect-guard',
    scoreFrom(findings, 91),
    'Redirect coverage checked.',
    [
      metric('Live URLs sampled', String(pages.length)),
      metric('Failed URLs', String(failures.length), failures.length ? 'critical' : 'success'),
      metric('Redirects found', String(snapshot.redirects.length)),
      metric(
        'Duplicate targets',
        String(duplicateTargets.length),
        duplicateTargets.length ? 'info' : 'success',
      ),
    ],
    appendWarnings(findings, snapshot.graphqlWarnings),
  );
}

async function scanPixelDoctor(snapshot: ShopSnapshot): Promise<ProductReport> {
  const pages = await fetchStorefrontPages(snapshot);
  const platforms = TRACKING_PLATFORMS.map((platform) => ({
    ...platform,
    count: pages.reduce((sum, page) => sum + countMatches(page.html, platform.pattern), 0),
  })).filter((platform) => platform.count > 0);
  const duplicates = platforms.filter((platform) => platform.count > pages.length + 1);
  const consentMentions = pages.reduce(
    (sum, page) => sum + countMatches(page.html, /consent|privacy_api|customerPrivacy|dataLayer/gi),
    0,
  );
  const findings: Finding[] = [];

  for (const platform of duplicates) {
    findings.push(
      issue(
        `pixel-duplicate-${slug(platform.name)}`,
        'critical',
        `Possible duplicate ${platform.name} events`,
        `${platform.name} appeared ${platform.count} times across ${pages.length} sampled pages.`,
        'Check whether the platform is installed through both Customer Events and hardcoded theme/app snippets. Keep one event source and preserve deduplication IDs.',
        `${platform.count} matches`,
      ),
    );
  }

  if (platforms.length > 4) {
    findings.push(
      issue(
        'pixel-many-platforms',
        'warning',
        'Many tracking platforms are present',
        `${platforms.length} ad/analytics platforms were detected.`,
        'Review every platform owner and remove old testing pixels before they distort attribution.',
      ),
    );
  }

  if (platforms.length > 0 && consentMentions === 0) {
    findings.push(
      issue(
        'pixel-no-consent-signal',
        'warning',
        'No obvious consent signal in sampled HTML',
        'Klyna detected tracking scripts but did not see obvious consent/privacy API markers in sampled HTML.',
        'Confirm your CMP fires consent signals before marketing tags load, especially for EEA traffic.',
      ),
    );
  }

  if (findings.length === 0) {
    findings.push(
      issue(
        'pixel-ready',
        'success',
        'No duplicate tracking pattern detected',
        'Klyna did not see duplicate platform signatures in sampled pages.',
        'Run this again after installing tracking, reviews, affiliate, or upsell apps.',
      ),
    );
  }

  return report(
    'pixel-doctor',
    scoreFrom(findings, 90),
    'Tracking stack inspected.',
    [
      metric('Pages sampled', String(pages.length)),
      metric('Platforms found', String(platforms.length)),
      metric(
        'Duplicate risks',
        String(duplicates.length),
        duplicates.length ? 'critical' : 'success',
      ),
      metric('Consent hints', String(consentMentions), consentMentions ? 'success' : 'warning'),
    ],
    findings,
  );
}

function scanFeedDoctor(snapshot: ShopSnapshot): ProductReport {
  const products = snapshot.products;
  const variants = products.flatMap((product) =>
    product.variants.map((variant) => ({ product, variant })),
  );
  const missingBarcode = variants.filter(({ variant }) => !variant.barcode);
  const missingSku = variants.filter(({ variant }) => !variant.sku);
  const missingBrand = products.filter((product) => !product.vendor);
  const missingImages = products.filter((product) => !product.imageUrl);
  const weakSeo = products.filter((product) => !product.seoTitle || !product.seoDescription);
  const findings: Finding[] = [];

  if (missingBarcode.length / Math.max(variants.length, 1) > 0.35) {
    findings.push(
      issue(
        'feed-missing-gtin',
        'critical',
        'Many variants are missing GTIN/barcode',
        `${missingBarcode.length} of ${variants.length} sampled variants have no barcode.`,
        'For manufactured products, add GTINs. For custom products, make sure the feed sends the correct custom-product/identifier setting.',
        sampleVariantEvidence(missingBarcode),
      ),
    );
  }

  if (missingSku.length / Math.max(variants.length, 1) > 0.25) {
    findings.push(
      issue(
        'feed-missing-sku',
        'warning',
        'Many variants are missing SKUs',
        `${missingSku.length} sampled variants have no SKU.`,
        'Add stable SKUs so channel diagnostics, inventory operations, and feed exports are easier to reconcile.',
        sampleVariantEvidence(missingSku),
      ),
    );
  }

  if (missingBrand.length > 0) {
    findings.push(
      issue(
        'feed-missing-brand',
        'warning',
        'Products are missing brand/vendor',
        `${missingBrand.length} sampled products have no vendor value.`,
        'Set vendor/brand or map a brand metafield before sending to Google Merchant Center.',
        missingBrand
          .slice(0, 5)
          .map((p) => p.title)
          .join(', '),
      ),
    );
  }

  if (missingImages.length > 0) {
    findings.push(
      issue(
        'feed-missing-images',
        'critical',
        'Products without main images',
        `${missingImages.length} sampled products have no featured image.`,
        'Add product images before submitting to Shopping surfaces.',
        missingImages
          .slice(0, 5)
          .map((p) => p.title)
          .join(', '),
      ),
    );
  }

  if (weakSeo.length / Math.max(products.length, 1) > 0.4) {
    findings.push(
      issue(
        'feed-weak-seo-copy',
        'info',
        'SEO titles/descriptions are incomplete',
        `${weakSeo.length} sampled products are missing SEO title or description values.`,
        'Use this as a feed title/description cleanup queue before scaling paid traffic.',
      ),
    );
  }

  if (findings.length === 0) {
    findings.push(
      issue(
        'feed-ready',
        'success',
        'Sampled catalog is feed-ready',
        'Klyna did not find major GTIN, SKU, brand, image, or SEO metadata gaps in the sample.',
        'Run scheduled checks before pushing new products to Google Merchant Center.',
      ),
    );
  }

  return report(
    'feed-doctor',
    scoreFrom(findings, 88),
    'Catalog feed readiness checked.',
    [
      metric('Products sampled', String(products.length)),
      metric('Variants sampled', String(variants.length)),
      metric(
        'Missing GTIN',
        String(missingBarcode.length),
        missingBarcode.length ? 'critical' : 'success',
      ),
      metric(
        'Missing images',
        String(missingImages.length),
        missingImages.length ? 'critical' : 'success',
      ),
    ],
    appendWarnings(findings, snapshot.graphqlWarnings),
  );
}

async function fetchStorefrontPages(snapshot: ShopSnapshot): Promise<StorefrontPage[]> {
  const urls = [
    snapshot.primaryDomainUrl,
    ...snapshot.products.map((product) => product.onlineStoreUrl),
    ...snapshot.collections.map((collection) => collection.onlineStoreUrl),
  ]
    .filter(Boolean)
    .slice(0, 6) as string[];
  const unique = Array.from(new Set(urls));
  return Promise.all(unique.map(fetchPage));
}

async function fetchPage(url: string): Promise<StorefrontPage> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'KlynaSuiteBot/1.0 (+https://klyna.dev)' },
    });
    clearTimeout(timeout);
    const html = await response.text();
    return { url, ok: response.ok, status: response.status, html };
  } catch (error) {
    return {
      url,
      ok: false,
      status: 0,
      html: '',
      error: error instanceof Error ? error.message : 'fetch failed',
    };
  }
}

function countSignatures(pages: StorefrontPage[]) {
  return SCRIPT_SIGNATURES.map((signature) => ({
    app: signature.app,
    count: pages.reduce((sum, page) => sum + countMatches(page.html, signature.pattern), 0),
  }))
    .filter((hit) => hit.count > 0)
    .sort((a, b) => b.count - a.count);
}

function extractScripts(pages: StorefrontPage[]) {
  const external = pages.reduce((sum, page) => {
    return sum + countMatches(page.html, /<script\b[^>]*\bsrc=/gi);
  }, 0);
  const inline = pages.reduce((sum, page) => {
    return sum + countMatches(page.html, /<script\b(?![^>]*\bsrc=)[^>]*>/gi);
  }, 0);
  return { external, inline };
}

function duplicatePlatforms(pages: StorefrontPage[]) {
  return TRACKING_PLATFORMS.map((platform) => ({
    name: platform.name,
    count: pages.reduce((sum, page) => sum + countMatches(page.html, platform.pattern), 0),
  })).filter((platform) => platform.count > pages.length + 1);
}

function findDuplicateRedirectTargets(redirects: { target: string }[]) {
  const counts = new Map<string, number>();
  for (const redirect of redirects) {
    counts.set(redirect.target, (counts.get(redirect.target) ?? 0) + 1);
  }
  return Array.from(counts.entries()).filter(([, count]) => count > 2);
}

function sampleVariantEvidence(
  items: Array<{ product: ProductSnapshot; variant: { title: string } }>,
) {
  return items
    .slice(0, 5)
    .map(({ product, variant }) => `${product.title} / ${variant.title}`)
    .join(', ');
}

function appendWarnings(findings: Finding[], warnings: string[]) {
  return [
    ...findings,
    ...warnings
      .slice(0, 3)
      .map((warning, index) =>
        issue(
          `api-warning-${index}`,
          'info',
          'Shopify API field was unavailable',
          warning,
          'Review the app scopes for this listing before submission.',
        ),
      ),
  ];
}

function countMatches(value: string, pattern: RegExp) {
  pattern.lastIndex = 0;
  return value.match(pattern)?.length ?? 0;
}

function scoreFrom(findings: Finding[], fallback: number) {
  const score = findings.reduce((value, finding) => {
    if (finding.severity === 'critical') return value - 18;
    if (finding.severity === 'warning') return value - 9;
    if (finding.severity === 'info') return value - 3;
    return value;
  }, fallback);
  return Math.max(32, Math.min(99, score));
}

function report(
  productKey: ProductKey,
  score: number,
  summary: string,
  metrics: Metric[],
  findings: Finding[],
): ProductReport {
  return {
    productKey,
    score,
    status: score >= 82 ? 'healthy' : score >= 64 ? 'attention' : 'risk',
    summary,
    metrics,
    findings,
    generatedAt: new Date().toISOString(),
  };
}

function issue(
  id: string,
  severity: Severity,
  title: string,
  detail: string,
  action: string,
  evidence?: string,
): Finding {
  return { id, severity, title, detail, action, evidence };
}

function metric(label: string, value: string, tone?: Metric['tone']): Metric {
  return { label, value, tone };
}

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 48);
}
