// Klyna Feed — generation orchestration.
//
// generateFeed() is the one function the whole app revolves around: it loads a
// feed config, pulls the catalog from the Admin API, applies include rules,
// resolves every surviving item through the field/taxonomy/metafield mapping,
// renders the channel's native format, scores health, and persists a FeedRun.
// It runs identically from a manual button, a scheduled tick, or a webhook.

import { randomBytes } from 'crypto';
import prisma from '../db.server';
import { fetchAllProducts } from './products.server';
import { resolveItem, shouldInclude } from './mapping';
import { renderCsv, renderXml } from './render';
import { computeHealth } from './health';
import { toFeedConfig, type FeedRow } from './serialize';
import type { Channel, FeedConfig, FeedField, GeneratedFeed, ProductView } from './types';

type AdminClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

// A URL-safe random token for public feed delivery.
export function newFeedToken(): string {
  return randomBytes(18).toString('base64url');
}

// Build the resolved item set + health, without touching the DB. Exposed for
// preview ("dry run") rendering in the editor.
export function buildFeed(config: FeedConfig, products: ProductView[]): GeneratedFeed {
  const included: Record<FeedField, string>[] = [];
  let excluded = 0;

  for (const view of products) {
    const verdict = shouldInclude(config.includeRules, view);
    if (!verdict.included) {
      excluded += 1;
      continue;
    }
    included.push(resolveItem(config, view));
  }

  const health = computeHealth(config.channel, included);
  const warningCount = health.issues
    .filter((i) => i.severity !== 'info')
    .reduce((sum, i) => sum + i.count, 0);

  const meta = {
    shop: config.shop,
    feedName: config.name,
    language: config.language,
    generatedAt: new Date().toUTCString(),
  };

  const body = config.format === 'xml' ? renderXml(included, meta) : renderCsv(included);
  const contentType: GeneratedFeed['contentType'] = config.format === 'xml' ? 'text/xml' : 'text/csv';

  return {
    body,
    contentType,
    itemCount: products.length,
    includedCount: included.length,
    excludedCount: excluded,
    warningCount,
    health,
  };
}

export interface GenerateOptions {
  feedId: string;
  shop: string;
  trigger: 'manual' | 'scheduled' | 'webhook';
}

// Full generate-and-persist. Loads the feed + shop settings, fetches products,
// builds the feed, writes a FeedRun, and advances the schedule. Returns the run
// id and the computed GeneratedFeed.
export async function generateFeed(
  admin: AdminClient,
  { feedId, shop, trigger }: GenerateOptions,
): Promise<{ runId: string; result: GeneratedFeed }> {
  const feed = await prisma.feed.findFirst({ where: { id: feedId, shop } });
  if (!feed) throw new Error('Feed not found');

  const settings = await prisma.shopSettings.findUnique({ where: { shop } });
  const namespace = settings?.metafieldNamespace ?? 'klyna_feed';

  const baseConfig = toFeedConfig(feed as unknown as FeedRow, {
    metafieldNamespace: namespace,
    defaultGoogleCategory: settings?.defaultGoogleCategory ?? null,
  });

  // Load any AI title overrides for this shop+channel. We key by productId so
  // resolveItem() can swap in a channel-tuned title when one exists.
  const channelKey = baseConfig.channel === 'tiktok' ? 'meta' : baseConfig.channel;
  const overrideRows = await prisma.feedTitleOverride.findMany({
    where: { shop, channel: channelKey },
  });
  const titleOverrides: Record<string, string> = {};
  for (const row of overrideRows) titleOverrides[row.productId] = row.title;
  const config: FeedConfig = { ...baseConfig, titleOverrides };

  let result: GeneratedFeed;
  let status: 'ok' | 'warn' | 'error' = 'ok';
  let error: string | null = null;

  try {
    const products = await fetchAllProducts(admin, { namespace });
    result = buildFeed(config, products);
    status = result.health.issues.some((i) => i.severity === 'error') ? 'warn' : 'ok';
  } catch (err) {
    error = err instanceof Error ? err.message : 'Feed generation failed';
    result = {
      body: '',
      contentType: config.format === 'xml' ? 'text/xml' : 'text/csv',
      itemCount: 0,
      includedCount: 0,
      excludedCount: 0,
      warningCount: 0,
      health: { score: 0, grade: 'F', issues: [] },
    };
    status = 'error';
  }

  const run = await prisma.feedRun.create({
    data: {
      feedId: feed.id,
      shop,
      body: result.body,
      contentType: result.contentType,
      itemCount: result.itemCount,
      includedCount: result.includedCount,
      excludedCount: result.excludedCount,
      warningCount: result.warningCount,
      health: JSON.stringify(result.health),
      status,
      error,
      trigger,
    },
  });

  // Advance the schedule and stamp last/next refresh.
  const now = new Date();
  const next =
    feed.refreshEveryMin > 0
      ? new Date(now.getTime() + feed.refreshEveryMin * 60_000)
      : null;
  await prisma.feed.update({
    where: { id: feed.id },
    data: { lastRefreshAt: now, nextRefreshAt: next },
  });

  // Keep only the latest 20 runs per feed so the DB doesn't grow unbounded.
  const stale = await prisma.feedRun.findMany({
    where: { feedId: feed.id },
    orderBy: { createdAt: 'desc' },
    skip: 20,
    select: { id: true },
  });
  if (stale.length) {
    await prisma.feedRun.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
  }

  if (error) throw new Error(error);
  return { runId: run.id, result };
}

// Ensure a ShopSettings row exists; returns it. Used by routes on first load.
export async function ensureShopSettings(shop: string) {
  return prisma.shopSettings.upsert({
    where: { shop },
    update: {},
    create: { shop },
  });
}

export const CHANNEL_FORMAT: Record<Channel, 'xml' | 'csv'> = {
  google: 'xml',
  meta: 'csv',
  tiktok: 'csv',
  pinterest: 'csv',
};
