// Impression analytics helpers.
//
// The storefront beacon (theme app extension) pings the public `app.api.event`
// route. We roll counts up into one `Impression` row per widget per day so the
// table stays tiny no matter how much traffic a store gets.

import prisma from '../db.server';

export type WidgetType = 'timer' | 'scarcity' | 'proof';
export type EventKind = 'view' | 'click' | 'conversion';

/** UTC YYYY-MM-DD bucket key for a given date (defaults to now). */
export function dayKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Increment the running view/click/conversion totals for a widget on a day.
 * Uses an upsert so concurrent beacons never lose a count.
 */
export async function recordEvent(params: {
  shop: string;
  widgetType: WidgetType;
  kind: EventKind;
  timerId?: string | null;
  scarcityId?: string | null;
}): Promise<void> {
  const { shop, widgetType, kind } = params;
  const timerId = params.timerId ?? null;
  const scarcityId = params.scarcityId ?? null;
  const day = dayKey();

  const createCounts = {
    views: kind === 'view' ? 1 : 0,
    clicks: kind === 'click' ? 1 : 0,
    conversions: kind === 'conversion' ? 1 : 0,
  };
  const updateCounts =
    kind === 'view'
      ? { views: { increment: 1 } }
      : kind === 'click'
        ? { clicks: { increment: 1 } }
        : { conversions: { increment: 1 } };

  // Prisma composite unique keys do not accept null, but our schema permits null
  // for timerId / scarcityId. Coerce to empty strings for the where clause and
  // store the same sentinel so the row is found on subsequent increments.
  const timerKey = timerId ?? '';
  const scarcityKey = scarcityId ?? '';
  await prisma.impression.upsert({
    where: {
      shop_widgetType_timerId_scarcityId_day: {
        shop,
        widgetType,
        timerId: timerKey,
        scarcityId: scarcityKey,
        day,
      },
    },
    create: {
      shop,
      widgetType,
      timerId: timerKey || null,
      scarcityId: scarcityKey || null,
      day,
      ...createCounts,
    },
    update: updateCounts,
  });
}

export type Totals = { views: number; clicks: number; conversions: number };

/** Sum impression counts for a shop over the last `days` days. */
export async function totalsForShop(shop: string, days = 30): Promise<Totals> {
  const since = dayKey(new Date(Date.now() - days * 86_400_000));
  const rows = await prisma.impression.findMany({
    where: { shop, day: { gte: since } },
    select: { views: true, clicks: true, conversions: true },
  });
  return rows.reduce<Totals>(
    (acc, r) => ({
      views: acc.views + r.views,
      clicks: acc.clicks + r.clicks,
      conversions: acc.conversions + r.conversions,
    }),
    { views: 0, clicks: 0, conversions: 0 },
  );
}

/** Click-through rate as a 0–100 percentage, guarded against divide-by-zero. */
export function ctr(t: Totals): number {
  return t.views === 0 ? 0 : Math.round((t.clicks / t.views) * 1000) / 10;
}
