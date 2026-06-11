import { type LoaderFunctionArgs } from '@remix-run/node';
import { Link, useLoaderData } from '@remix-run/react';
import {
  Badge,
  BlockStack,
  Box,
  Card,
  EmptyState,
  InlineStack,
  Layout,
  Page,
  Text,
} from '@shopify/polaris';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';
import { CHANNELS } from '../lib/channels';
import type { Channel, FeedHealth } from '../lib/types';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const feeds = await prisma.feed.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: 'asc' },
    include: { runs: { orderBy: { createdAt: 'desc' }, take: 1 } },
  });

  return {
    feeds: feeds.map((f) => {
      const last = f.runs[0];
      const health = last ? (JSON.parse(last.health) as FeedHealth) : null;
      return {
        id: f.id,
        name: f.name,
        channel: f.channel as Channel,
        format: f.format,
        enabled: f.enabled,
        refreshEveryMin: f.refreshEveryMin,
        includedCount: last?.includedCount ?? 0,
        grade: health?.grade ?? null,
        score: health?.score ?? null,
        lastRefreshAt: f.lastRefreshAt ? f.lastRefreshAt.toISOString() : null,
      };
    }),
  };
};

function gradeTone(grade: string | null) {
  if (grade === 'A' || grade === 'B') return 'success' as const;
  if (grade === 'C' || grade === 'D') return 'warning' as const;
  if (grade === 'F') return 'critical' as const;
  return 'new' as const;
}

function refreshLabel(min: number): string {
  if (min === 0) return 'Manual only';
  if (min % 1440 === 0) return `Every ${min / 1440}d`;
  if (min % 60 === 0) return `Every ${min / 60}h`;
  return `Every ${min}m`;
}

export default function FeedsIndex() {
  const { feeds } = useLoaderData<typeof loader>();

  return (
    <Page
      title="Feeds"
      backAction={{ url: '/app' }}
      primaryAction={{ content: 'New feed', url: '/app/feeds/new' }}
    >
      <Layout>
        <Layout.Section>
          {feeds.length === 0 ? (
            <Card>
              <EmptyState
                heading="No feeds yet"
                action={{ content: 'Create a feed', url: '/app/feeds/new' }}
                image=""
              >
                <p>
                  Create a feed for Google, Meta, TikTok, or Pinterest. Klyna maps your
                  catalog to the channel spec and gives you a feed URL that stays in sync.
                </p>
              </EmptyState>
            </Card>
          ) : (
            <Card>
              <BlockStack gap="200">
                {feeds.map((f) => (
                  <Box
                    key={f.id}
                    padding="300"
                    borderColor="border"
                    borderWidth="025"
                    borderRadius="200"
                  >
                    <InlineStack align="space-between" blockAlign="center">
                      <BlockStack gap="050">
                        <InlineStack gap="200" blockAlign="center">
                          <Text as="h3" variant="headingSm">{f.name}</Text>
                          <Badge tone={f.enabled ? 'success' : undefined}>
                            {f.enabled ? 'Live' : 'Paused'}
                          </Badge>
                          {f.grade && (
                            <Badge tone={gradeTone(f.grade)}>{`${f.grade} · ${f.score}`}</Badge>
                          )}
                        </InlineStack>
                        <Text as="span" variant="bodySm" tone="subdued">
                          {CHANNELS[f.channel].label} · {f.format.toUpperCase()} ·{' '}
                          {f.includedCount} items · {refreshLabel(f.refreshEveryMin)}
                          {f.lastRefreshAt
                            ? ` · refreshed ${new Date(f.lastRefreshAt).toLocaleString()}`
                            : ''}
                        </Text>
                      </BlockStack>
                      <Link to={`/app/feeds/${f.id}`}>Manage →</Link>
                    </InlineStack>
                  </Box>
                ))}
              </BlockStack>
            </Card>
          )}
        </Layout.Section>
      </Layout>
    </Page>
  );
}
