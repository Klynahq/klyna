// Pure analytics utilities used by both server (loaders) and client (component
// rendering). Keep this file dependency-free so it can ship to the browser
// bundle without dragging in Prisma or the .server module graph.

export type WidgetType = 'timer' | 'scarcity' | 'proof';
export type EventKind = 'view' | 'click' | 'conversion';
export type Totals = { views: number; clicks: number; conversions: number };

/** YYYY-MM-DD bucket for a Date (UTC). */
export function dayKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/** Click-through rate as a 0–100 integer. */
export function ctr(t: Totals): number {
  if (!t.views) return 0;
  return Math.round((t.clicks / t.views) * 100);
}
