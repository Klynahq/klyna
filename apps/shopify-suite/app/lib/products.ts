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
  proFeatures: string[];
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
      'Pro adds unlimited debris scans, a 50-scan history, and CSV evidence exports for cleanup handoff.',
    proFeatures: [
      'Unlimited manual debris scans',
      'Full history for up to 50 scans',
      'CSV exports with findings, evidence, and next steps',
      'Cleanup evidence for developer and agency handoff',
    ],
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
      'Pro adds unlimited promotion checks, a 50-scan history, and CSV launch-readiness reports.',
    proFeatures: [
      'Unlimited promotion preflight checks',
      'Full history for up to 50 checks',
      'CSV exports with collision evidence and next steps',
      'Launch-readiness records for campaign handoff',
    ],
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
      'Pro includes URL-loss baselines, redirect-map risk detection, destination validation, guarded redirect creation, CSV export, and a timestamped change log.',
    proFeatures: [
      'URL-loss baselines for deleted and renamed content',
      'Redirect chain, loop, and destination validation',
      'Guarded redirect creation with a change log',
      'CSV redirect-map exports for migrations',
    ],
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
      'Pro adds unlimited tracking inspections, a 50-scan history, and CSV evidence exports for implementation handoff.',
    proFeatures: [
      'Unlimited tracking-stack inspections',
      'Full history for up to 50 inspections',
      'CSV exports with platform evidence and next steps',
      'Duplicate-event records for developer handoff',
    ],
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
      'Pro adds unlimited feed checks, a 50-scan history, and CSV evidence exports for catalog cleanup.',
    proFeatures: [
      'Unlimited catalog feed-readiness checks',
      'Full history for up to 50 checks',
      'CSV exports with product and variant evidence',
      'Catalog cleanup records for channel handoff',
    ],
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
