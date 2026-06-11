import { type LoaderFunctionArgs } from '@remix-run/node';
import { Link, useLoaderData } from '@remix-run/react';
import {
  Badge,
  BlockStack,
  Box,
  Card,
  InlineGrid,
  InlineStack,
  Layout,
  Page,
  Text,
} from '@shopify/polaris';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';
import { ensureShopSettings } from '../lib/feeds.server';
import { CHANNELS } from '../lib/channels';
import type { Channel, FeedHealth } from '../lib/types';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  await ensureShopSettings(session.shop);

  const feeds = await prisma.feed.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: 'asc' },
    include: {
      runs: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });

  const summary = feeds.map((f) => {
    const last = f.runs[0];
    const health = last ? (JSON.parse(last.health) as FeedHealth) : null;
    return {
      id: f.id,
      name: f.name,
      channel: f.channel as Channel,
      enabled: f.enabled,
      lastRefreshAt: f.lastRefreshAt ? f.lastRefreshAt.toISOString() : null,
      itemCount: last?.includedCount ?? 0,
      grade: health?.grade ?? null,
      score: health?.score ?? null,
      status: last?.status ?? null,
    };
  });

  return { shop: session.shop, summary };
};

function gradeTone(grade: string | null) {
  if (grade === 'A' || grade === 'B') return 'success' as const;
  if (grade === 'C' || grade === 'D') return 'warning' as const;
  if (grade === 'F') return 'critical' as const;
  return 'new' as const;
}

export default function Dashboard() {
  const { shop, summary } = useLoaderData<typeof loader>();

  const channels = Object.values(CHANNELS);
  const totalItems = summary.reduce((s, f) => s + f.itemCount, 0);
  const live = summary.filter((f) => f.enabled).length;

  return (
    <Page
      title="Klyna Feed"
      subtitle={`Connected to ${shop}`}
      primaryAction={{ content: 'New feed', url: '/app/feeds/new' }}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">Product feeds, always in sync.</Text>
              <Text as="p" variant="bodyMd" tone="subdued">
                Klyna Feed generates Google Shopping XML and Meta, TikTok, and Pinterest
                CSV feeds straight from your catalog — with field and taxonomy mapping,
                per-channel include rules, metafield overrides, scheduled refresh, and a
                health report that catches missing fields before the channel rejects them.
              </Text>
              <InlineStack gap="400">
                <Stat label="Feeds live" value={String(live)} />
                <Stat label="Items syndicated" value={String(totalItems)} />
                <Stat label="Channels" value="4" />
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {summary.length > 0 && (
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Your feeds</Text>
                <BlockStack gap="200">
                  {summary.map((f) => (
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
                          </InlineStack>
                          <Text as="span" variant="bodySm" tone="subdued">
                            {CHANNELS[f.channel].label} · {f.itemCount} items
                            {f.lastRefreshAt
                              ? ` · refreshed ${new Date(f.lastRefreshAt).toLocaleString()}`
                              : ' · never refreshed'}
                          </Text>
                        </BlockStack>
                        <InlineStack gap="300" blockAlign="center">
                          {f.grade && (
                            <Badge tone={gradeTone(f.grade)}>
                              {`Health ${f.grade} · ${f.score}`}
                            </Badge>
                          )}
                          <Link to={`/app/feeds/${f.id}`}>Manage →</Link>
                        </InlineStack>
                      </InlineStack>
                    </Box>
                  ))}
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        )}

        <Layout.Section>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Supported channels</Text>
            <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="300">
              {channels.map((c) => (
                <Card key={c.id}>
                  <BlockStack gap="100">
                    <Text as="h3" variant="headingSm">{c.label}</Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      {c.format === 'xml' ? 'Google Shopping XML (RSS 2.0)' : 'CSV catalog'}
                    </Text>
                    <Link to={`/app/feeds/new?channel=${c.id}`}>Create feed →</Link>
                  </BlockStack>
                </Card>
              ))}
            </InlineGrid>
          </BlockStack>
        </Layout.Section>

        {summary.length === 0 && (
          <Layout.Section>
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">Get started</Text>
                <Text as="p" tone="subdued">
                  You have no feeds yet. Create your first one — pick a channel, map a few
                  fields, and Klyna generates a feed URL you paste into Google Merchant
                  Center, Meta Commerce Manager, TikTok, or Pinterest.
                </Text>
                <Link to="/app/feeds/new">Create your first feed →</Link>
              </BlockStack>
            </Card>
          </Layout.Section>
        )}
      </Layout>
    </Page>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <BlockStack gap="050">
      <Text as="span" variant="headingLg" fontWeight="bold">{value}</Text>
      <Text as="span" variant="bodySm" tone="subdued">{label}</Text>
    </BlockStack>
  );
}
