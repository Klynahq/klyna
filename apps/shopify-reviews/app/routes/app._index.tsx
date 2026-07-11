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
import { roundRating } from '../lib/reviews.server';
import { getShopAiSettings } from '../lib/ai.server';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const [pending, published, requestsScheduled, ratingAgg, recent, ai, topProduct] = await Promise.all([
    prisma.review.count({ where: { shop, status: 'pending' } }),
    prisma.review.count({ where: { shop, status: 'published' } }),
    prisma.reviewRequest.count({ where: { shop, status: 'scheduled' } }),
    prisma.review.aggregate({
      where: { shop, status: 'published' },
      _avg: { rating: true },
      _count: true,
    }),
    prisma.review.findMany({
      where: { shop },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    getShopAiSettings(shop),
    prisma.productRating.findFirst({
      where: { shop },
      orderBy: { reviewCount: 'desc' },
      select: { productId: true },
    }),
  ]);

  return {
    shop,
    stats: {
      pending,
      published,
      requestsScheduled,
      avgRating: ratingAgg._avg.rating ? roundRating(ratingAgg._avg.rating) : 0,
      totalRated: ratingAgg._count,
    },
    recent,
    aiEnabled: ai.provider !== 'off' && !!ai.apiKey,
    aiProvider: ai.provider,
    topProductId: topProduct?.productId ?? null,
  };
};

function statusTone(status: string): 'attention' | 'success' | 'critical' | 'info' {
  if (status === 'published') return 'success';
  if (status === 'pending') return 'attention';
  if (status === 'rejected' || status === 'spam') return 'critical';
  return 'info';
}

export default function Dashboard() {
  const { shop, stats, recent, aiEnabled, aiProvider, topProductId } = useLoaderData<typeof loader>();

  const themesTo = topProductId
    ? `/app/products/${encodeURIComponent(topProductId)}/themes`
    : '/app/settings';

  const tiles: { title: string; body: string; to: string; badge?: string; ai?: boolean }[] = [
    {
      title: 'Moderation queue',
      body: 'Approve, reply to, or reject incoming photo + star reviews before they go live.',
      to: '/app/moderation',
      badge: stats.pending > 0 ? `${stats.pending} waiting` : undefined,
    },
    {
      title: 'Review requests',
      body: 'Buyer email automation is paused in the launch build until protected customer data approval is granted.',
      to: '/app/requests',
      badge: stats.requestsScheduled > 0 ? `${stats.requestsScheduled} scheduled` : undefined,
    },
    {
      title: 'Review themes',
      body: 'Summarize what customers keep mentioning about a product into the top three themes with representative quotes.',
      to: themesTo,
      ai: true,
    },
    {
      title: 'Analytics',
      body: 'Track rating trends, response rate, photo coverage, and top-reviewed products.',
      to: '/app/analytics',
    },
  ];

  const metrics = [
    { label: 'Published reviews', value: String(stats.published) },
    { label: 'Average rating', value: stats.avgRating ? `${stats.avgRating} ★` : '—' },
    { label: 'Awaiting moderation', value: String(stats.pending) },
    { label: 'Requests scheduled', value: String(stats.requestsScheduled) },
  ];

  return (
    <Page title="Klyna Reviews" subtitle={`Connected to ${shop}`}>
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <InlineStack gap="200" blockAlign="center">
                <Text as="h2" variant="headingMd">Reviews that build trust and rank.</Text>
                {aiEnabled ? (
                  <Badge tone="success">{`AI · ${aiProvider}`}</Badge>
                ) : (
                  <Badge tone="info">No AI key set</Badge>
                )}
              </InlineStack>
              <Text as="p" variant="bodyMd" tone="subdued">
                Collect star and photo reviews, moderate submissions, and publish
                AggregateRating schema so Google can understand your product ratings.
                The launch build does not read Shopify orders or customers.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <InlineGrid columns={{ xs: 2, md: 4 }} gap="300">
            {metrics.map((m) => (
              <Card key={m.label}>
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">{m.label}</Text>
                  <Text as="p" variant="heading2xl" fontWeight="bold">{m.value}</Text>
                </BlockStack>
              </Card>
            ))}
          </InlineGrid>
        </Layout.Section>

        <Layout.Section>
          <InlineGrid columns={{ xs: 1, md: 2 }} gap="300">
            {tiles.map((t) => (
              <Card key={t.to + t.title}>
                <BlockStack gap="200">
                  <InlineStack align="space-between" blockAlign="center">
                    <InlineStack gap="200" blockAlign="center">
                      <Text as="h3" variant="headingSm">{t.title}</Text>
                      {t.ai && <Badge tone={aiEnabled ? 'success' : 'info'}>AI</Badge>}
                    </InlineStack>
                    {t.badge && <Badge tone="attention">{t.badge}</Badge>}
                  </InlineStack>
                  <Text as="p" variant="bodyMd" tone="subdued">{t.body}</Text>
                  <Link to={t.to}>Open</Link>
                </BlockStack>
              </Card>
            ))}
          </InlineGrid>
        </Layout.Section>

        {recent.length > 0 && (
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Latest reviews</Text>
                <BlockStack gap="200">
                  {recent.map((r) => (
                    <Box
                      key={r.id}
                      padding="300"
                      borderColor="border"
                      borderWidth="025"
                      borderRadius="200"
                    >
                      <BlockStack gap="100">
                        <InlineStack align="space-between" blockAlign="center">
                          <InlineStack gap="200" blockAlign="center">
                            <Text as="span" fontWeight="bold">
                              {'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}
                            </Text>
                            <Text as="span" variant="bodySm" tone="subdued">{r.authorName}</Text>
                            {r.verified && <Badge tone="success" size="small">Verified</Badge>}
                          </InlineStack>
                          <Badge tone={statusTone(r.status)} size="small">{r.status}</Badge>
                        </InlineStack>
                        <Text as="p" variant="bodyMd">
                          {r.title ? <strong>{r.title} — </strong> : null}{r.body}
                        </Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          {r.productTitle} · {new Date(r.createdAt).toLocaleDateString()}
                        </Text>
                      </BlockStack>
                    </Box>
                  ))}
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        )}
      </Layout>
    </Page>
  );
}
