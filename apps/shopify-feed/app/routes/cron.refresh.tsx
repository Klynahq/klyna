import { type LoaderFunctionArgs, json } from '@remix-run/node';
import shopify from '../shopify.server';
import prisma from '../db.server';
import { generateFeed } from '../lib/feeds.server';

// Scheduled-refresh worker. A hosted cron (Vercel Cron, GitHub Actions, Fly
// machines, etc.) hits this every few minutes with the CRON_SECRET so it can
// run without an interactive session. It finds every enabled feed whose
// nextRefreshAt is due (and whose shop isn't paused), pulls offline admin
// access for that shop, and regenerates the feed.
//
// Auth: pass ?key=<CRON_SECRET> or an Authorization: Bearer <CRON_SECRET>
// header. CRON_SECRET defaults to FEED_TOKEN_SALT so a fresh install still has
// a non-empty secret.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const secret = process.env.CRON_SECRET ?? process.env.FEED_TOKEN_SALT ?? '';
  const url = new URL(request.url);
  const provided =
    url.searchParams.get('key') ??
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    '';

  if (!secret || provided !== secret) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const limit = Number(url.searchParams.get('limit') ?? '25');

  // Due = enabled, has a positive interval, and nextRefreshAt has passed (or is
  // null, meaning it has never been built). Paused shops are skipped.
  const pausedShops = (
    await prisma.shopSettings.findMany({
      where: { schedulePaused: true },
      select: { shop: true },
    })
  ).map((s) => s.shop);

  const due = await prisma.feed.findMany({
    where: {
      enabled: true,
      refreshEveryMin: { gt: 0 },
      shop: { notIn: pausedShops },
      OR: [{ nextRefreshAt: null }, { nextRefreshAt: { lte: now } }],
    },
    orderBy: { nextRefreshAt: 'asc' },
    take: Number.isFinite(limit) ? limit : 25,
  });

  const results: { feedId: string; shop: string; ok: boolean; detail: string }[] = [];

  for (const feed of due) {
    try {
      // Offline admin access for this shop (uses the stored offline session).
      const { admin } = await shopify.unauthenticated.admin(feed.shop);
      const { result } = await generateFeed(admin, {
        feedId: feed.id,
        shop: feed.shop,
        trigger: 'scheduled',
      });
      results.push({
        feedId: feed.id,
        shop: feed.shop,
        ok: true,
        detail: `${result.includedCount} items, health ${result.health.grade}`,
      });
    } catch (err) {
      results.push({
        feedId: feed.id,
        shop: feed.shop,
        ok: false,
        detail: err instanceof Error ? err.message : 'failed',
      });
    }
  }

  return json({
    ranAt: now.toISOString(),
    processed: results.length,
    results,
  });
};
