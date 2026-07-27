export type ProductKey =
  | 'cleanroom'
  | 'promo-qa'
  | 'redirect-guard'
  | 'pixel-doctor'
  | 'feed-doctor';

export type Severity = 'critical' | 'warning' | 'info' | 'success';

export interface Finding {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  action: string;
  evidence?: string;
}

export interface Metric {
  label: string;
  value: string;
  tone?: 'success' | 'warning' | 'critical' | 'info';
}

export interface ProductReport {
  productKey: ProductKey;
  score: number;
  status: 'healthy' | 'attention' | 'risk';
  summary: string;
  metrics: Metric[];
  findings: Finding[];
  generatedAt: string;
}

export interface ProductDefinition {
  key: ProductKey;
  name: string;
  shortName: string;
  tagline: string;
  outcome: string;
  primaryAction: string;
  listingPositioning: string;
  paidValue: string;
}

export const products: Record<ProductKey, ProductDefinition> = {
  cleanroom: {
    key: 'cleanroom',
    name: 'Klyna Cleanroom',
    shortName: 'Cleanroom',
    tagline: 'Find old app code, duplicate pixels, and theme debris before it slows your store.',
    outcome: 'A clean, faster, easier-to-maintain storefront with evidence before every cleanup.',
    primaryAction: 'Run debris scan',
    listingPositioning:
      'Safe theme cleanup evidence for merchants who have installed too many apps.',
    paidValue:
      'Paid plans unlock monitored scans, cleanup exports, theme duplicate workflow, and rollback notes.',
  },
  'promo-qa': {
    key: 'promo-qa',
    name: 'Klyna Promo QA',
    shortName: 'Promo QA',
    tagline: 'Test discounts, free shipping, and margin risk before a sale goes live.',
    outcome:
      'Fewer broken campaigns, fewer surprise discount conflicts, and cleaner BFCM launch days.',
    primaryAction: 'Check promo stack',
    listingPositioning: 'Preflight QA for Shopify promotions, not another discount builder.',
    paidValue:
      'Paid plans unlock saved campaign scenarios, margin thresholds, scheduled preflight checks, and launch reports.',
  },
  'redirect-guard': {
    key: 'redirect-guard',
    name: 'Klyna Redirect Guard',
    shortName: 'Redirect Guard',
    tagline: 'Catch deleted URLs, broken links, and redirect gaps before SEO traffic leaks.',
    outcome:
      'A safer catalog and migration workflow with redirect coverage merchants can understand.',
    primaryAction: 'Audit redirects',
    listingPositioning:
      'SEO-safe URL monitoring for product deletions, migrations, and content changes.',
    paidValue:
      'Starter includes URL-loss baselines, redirect-map risk detection, destination validation, guarded redirect creation, CSV export, and a timestamped change log.',
  },
  'pixel-doctor': {
    key: 'pixel-doctor',
    name: 'Klyna Pixel Doctor',
    shortName: 'Pixel Doctor',
    tagline:
      'Detect duplicate Meta, Google, TikTok, and consent tracking issues from the storefront.',
    outcome:
      'Cleaner attribution and fewer double-fired events without replacing the merchant tracking stack.',
    primaryAction: 'Inspect tracking',
    listingPositioning: 'A neutral pixel and consent debugger for stores with messy app stacks.',
    paidValue:
      'Paid plans unlock monitoring, event-origin maps, post-checkout checklists, and agency exports.',
  },
  'feed-doctor': {
    key: 'feed-doctor',
    name: 'Klyna Feed Doctor',
    shortName: 'Feed Doctor',
    tagline: 'Find Google Merchant Center readiness issues before products get disapproved.',
    outcome:
      'Cleaner product data for Shopping ads, free listings, Meta catalogs, and marketplace feeds.',
    primaryAction: 'Check feed readiness',
    listingPositioning:
      'A feed diagnostics layer for merchants who are not ready to replace their feed app.',
    paidValue:
      'Paid plans unlock variant-level exports, metafield fix queues, scheduled checks, and channel-specific reports.',
  },
};

export function getProductKey(): ProductKey {
  const raw = process.env.KLYNA_PRODUCT as ProductKey | undefined;
  return raw && raw in products ? raw : 'cleanroom';
}

export function toneForStatus(status: ProductReport['status']) {
  if (status === 'healthy') return 'success' as const;
  if (status === 'attention') return 'warning' as const;
  return 'critical' as const;
}
