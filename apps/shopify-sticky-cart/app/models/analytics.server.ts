// Analytics model — records and aggregates storefront interactions.
//
// The theme app extension POSTs lightweight events through the signed App
// Proxy (no auth token on the storefront). We record raw rows and roll them up
// for the admin dashboard. Aggregation happens in SQL-friendly chunks so it
// scales past a single store's traffic without loading every row into memory.

import prisma from '../db.server';

export const TRACKED_EVENTS = [
  'impression',
  'atc',
  'quickbuy',
  'variant',
  'qty',
  'freeship_unlock',
] as const;

export type TrackedEvent = (typeof TRACKED_EVENTS)[number];

export function isTrackedEvent(value: string): value is TrackedEvent {
  return (TRACKED_EVENTS as readonly string[]).includes(value);
}

export type RecordInput = {
  shop: string;
  event: TrackedEvent;
  productId?: string | null;
  variantId?: string | null;
  cartValue?: number | null;
};

/** Insert a single storefront event. Called from the App Proxy action. */
export async function recordEvent(input: RecordInput): Promise<void> {
  await prisma.clickEvent.create({
    data: {
      shop: input.shop,
      event: input.event,
      productId: input.productId ?? null,
      variantId: input.variantId ?? null,
      cartValue: input.cartValue ?? null,
    },
  });
}

export type Totals = Record<TrackedEvent, number>;

export type AnalyticsSummary = {
  totals: Totals;
  /** add-to-cart clicks ÷ impressions, as a 0–100 percentage. */
  atcRate: number;
  /** quick-buy clicks ÷ impressions, as a 0–100 percentage. */
  quickBuyRate: number;
  /** Last `days` of daily buckets, oldest first. */
  daily: { date: string; impressions: number; atc: number; quickbuy: number }[];
  /** Top products by add-to-cart clicks over the window. */
  topProducts: { productId: string; atc: number; impressions: number }[];
};

function emptyTotals(): Totals {
  return TRACKED_EVENTS.reduce((acc, e) => {
    acc[e] = 0;
    return acc;
  }, {} as Totals);
}

/** Roll up the last `days` of events for one shop into a dashboard summary. */
export async function getSummary(shop: string, days = 30): Promise<AnalyticsSummary> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const grouped = await prisma.clickEvent.groupBy({
    by: ['event'],
    where: { shop, createdAt: { gte: since } },
    _count: { _all: true },
  });

  const totals = emptyTotals();
  for (const g of grouped) {
    if (isTrackedEvent(g.event)) totals[g.event] = g._count._all;
  }

  const impressions = totals.impression || 0;
  const atcRate = impressions ? round1((totals.atc / impressions) * 100) : 0;
  const quickBuyRate = impressions ? round1((totals.quickbuy / impressions) * 100) : 0;

  // Daily buckets — pull only the columns we need and fold in JS (SQLite has no
  // date_trunc; this stays cheap for a single shop's window).
  const rows = await prisma.clickEvent.findMany({
    where: {
      shop,
      createdAt: { gte: since },
      event: { in: ['impression', 'atc', 'quickbuy'] },
    },
    select: { event: true, createdAt: true, productId: true },
  });

  const dayMap = new Map<string, { impressions: number; atc: number; quickbuy: number }>();
  const productMap = new Map<string, { atc: number; impressions: number }>();

  for (const r of rows) {
    const date = r.createdAt.toISOString().slice(0, 10);
    const bucket = dayMap.get(date) ?? { impressions: 0, atc: 0, quickbuy: 0 };
    if (r.event === 'impression') bucket.impressions += 1;
    else if (r.event === 'atc') bucket.atc += 1;
    else if (r.event === 'quickbuy') bucket.quickbuy += 1;
    dayMap.set(date, bucket);

    if (r.productId) {
      const p = productMap.get(r.productId) ?? { atc: 0, impressions: 0 };
      if (r.event === 'impression') p.impressions += 1;
      else if (r.event === 'atc') p.atc += 1;
      productMap.set(r.productId, p);
    }
  }

  const daily = fillDays(since, days, dayMap);

  const topProducts = [...productMap.entries()]
    .map(([productId, v]) => ({ productId, ...v }))
    .sort((a, b) => b.atc - a.atc || b.impressions - a.impressions)
    .slice(0, 5);

  return { totals, atcRate, quickBuyRate, daily, topProducts };
}

function fillDays(
  since: Date,
  days: number,
  dayMap: Map<string, { impressions: number; atc: number; quickbuy: number }>,
) {
  const out: AnalyticsSummary['daily'] = [];
  const start = new Date(since.toISOString().slice(0, 10));
  for (let i = 0; i < days; i += 1) {
    const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    const b = dayMap.get(key) ?? { impressions: 0, atc: 0, quickbuy: 0 };
    out.push({ date: key, ...b });
  }
  return out;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
