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

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const [pending, published, requestsScheduled, ratingAgg, recent] = await Promise.all([
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
  };
};

function statusTone(status: string): 'attention' | 'success' | 'critical' | 'info' {
  if (status === 'published') return 'success';
  if (status === 'pending') return 'attention';
  if (status === 'rejected' || status === 'spam') return 'critical';
  return 'info';
}

export default function Dashboard() {
  const { shop, stats, recent } = useLoaderData<typeof loader>();

  const tiles = [
    {
      title: 'Moderation queue',
      body: 'Approve, reply to, or reject incoming photo + star reviews before they go live.',
      to: '/app/moderation',
      badge: stats.pending > 0 ? `${stats.pending} waiting` : undefined,
    },
    {
      title: 'Review requests',
      body: 'Automated post-fulfillment emails that ask verified buyers to leave a review.',
      to: '/app/requests',
      badge: stats.requestsScheduled > 0 ? `${stats.requestsScheduled} scheduled` : undefined,
    },
    {
      title: 'Analytics',
      body: 'Track rating trends, response rate, photo coverage, and top-reviewed products.',
      to: '/app/analytics',
      badge: undefined,
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
              <Text as="h2" variant="headingMd">Reviews that build trust and rank.</Text>
              <Text as="p" variant="bodyMd" tone="subdued">
                Collect verified star + photo reviews, ask buyers automatically after
                fulfillment, and publish AggregateRating schema so Google shows your
                stars in search. No data leaves your store.
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
          <InlineGrid columns={{ xs: 1, md: 3 }} gap="300">
            {tiles.map((t) => (
              <Card key={t.to}>
                <BlockStack gap="200">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h3" variant="headingSm">{t.title}</Text>
                    {t.badge && <Badge tone="attention">{t.badge}</Badge>}
                  </InlineStack>
                  <Text as="p" variant="bodyMd" tone="subdued">{t.body}</Text>
                  <Link to={t.to}>Open →</Link>
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
