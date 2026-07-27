import { type LoaderFunctionArgs } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import {
  BlockStack,
  Box,
  Card,
  DataTable,
  Divider,
  InlineGrid,
  InlineStack,
  Layout,
  Page,
  ProgressBar,
  Text,
} from '@shopify/polaris';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';
import { roundRating } from '../lib/reviews.server';
import { useEmbeddedRoute } from '../lib/embedded-routes';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const [published, all, withPhotos, requestStats, ratings] = await Promise.all([
    prisma.review.findMany({
      where: { shop, status: 'published' },
      select: { rating: true, productId: true, productTitle: true, photos: true, createdAt: true },
    }),
    prisma.review.count({ where: { shop } }),
    prisma.review.count({ where: { shop, status: 'published', NOT: { photos: '[]' } } }),
    prisma.reviewRequest.groupBy({
      by: ['status'],
      where: { shop },
      _count: true,
    }),
    prisma.productRating.findMany({
      where: { shop },
      orderBy: { reviewCount: 'desc' },
      take: 10,
    }),
  ]);

  // Star distribution across all published reviews.
  const distribution = [0, 0, 0, 0, 0];
  let sum = 0;
  for (const r of published) {
    const star = Math.min(5, Math.max(1, r.rating));
    distribution[star - 1] = (distribution[star - 1] ?? 0) + 1;
    sum += star;
  }
  const publishedCount = published.length;
  const avgRating = publishedCount > 0 ? roundRating(sum / publishedCount) : 0;

  // Reviews collected in the last 6 months, grouped by YYYY-MM.
  const trend = new Map<string, number>();
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i, 1);
    trend.set(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, 0);
  }
  for (const r of published) {
    const d = new Date(r.createdAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (trend.has(key)) trend.set(key, (trend.get(key) ?? 0) + 1);
  }

  // Request funnel.
  const requestCounts: Record<string, number> = {};
  for (const r of requestStats) requestCounts[r.status] = r._count;
  const totalRequests = Object.values(requestCounts).reduce((a, b) => a + b, 0);
  const reviewedFromRequests = requestCounts.reviewed ?? 0;
  const responseRate =
    totalRequests > 0 ? Math.round((reviewedFromRequests / totalRequests) * 100) : 0;

  return {
    avgRating,
    publishedCount,
    totalReviews: all,
    photoCoverage: publishedCount > 0 ? Math.round((withPhotos / publishedCount) * 100) : 0,
    distribution,
    trend: Array.from(trend.entries()),
    responseRate,
    requestCounts,
    topProducts: ratings.map((r) => ({
      title: r.productId.split('/').pop() ?? r.productId,
      ratingValue: r.ratingValue,
      reviewCount: r.reviewCount,
    })),
  };
};

export default function Analytics() {
  const embeddedRoute = useEmbeddedRoute();
  const a = useLoaderData<typeof loader>();
  const maxTrend = Math.max(1, ...a.trend.map(([, v]) => v));
  const totalDist = Math.max(1, a.distribution.reduce((x, y) => x + y, 0));

  const metrics = [
    { label: 'Average rating', value: a.avgRating ? `${a.avgRating} ★` : '—' },
    { label: 'Published reviews', value: String(a.publishedCount) },
    { label: 'Photo coverage', value: `${a.photoCoverage}%` },
    { label: 'Request response rate', value: `${a.responseRate}%` },
  ];

  return (
    <Page title="Analytics" subtitle="Rating trends, response rate, and photo coverage" backAction={{ url: embeddedRoute('/app') }}>
      <Layout>
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
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Star distribution</Text>
                <BlockStack gap="200">
                  {[5, 4, 3, 2, 1].map((star) => {
                    const count = a.distribution[star - 1] ?? 0;
                    const pct = Math.round((count / totalDist) * 100);
                    return (
                      <InlineStack key={star} gap="300" blockAlign="center" wrap={false}>
                        <Box minWidth="44px">
                          <Text as="span" variant="bodySm">{star} ★</Text>
                        </Box>
                        <Box width="100%">
                          <ProgressBar progress={pct} size="small" tone="primary" />
                        </Box>
                        <Box minWidth="40px">
                          <Text as="span" variant="bodySm" tone="subdued" alignment="end">{count}</Text>
                        </Box>
                      </InlineStack>
                    );
                  })}
                </BlockStack>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Reviews per month</Text>
                <InlineStack gap="200" blockAlign="end" wrap={false}>
                  {a.trend.map(([month, count]) => (
                    <BlockStack key={month} gap="100" inlineAlign="center">
                      <div
                        style={{
                          width: 28,
                          height: 120,
                          display: 'flex',
                          alignItems: 'flex-end',
                        }}
                      >
                        <div
                          style={{
                            width: '100%',
                            height: `${Math.round((count / maxTrend) * 100)}%`,
                            minHeight: count > 0 ? 6 : 2,
                            background: count > 0 ? '#7c5cff' : 'var(--p-color-border)',
                            borderRadius: 6,
                          }}
                          title={`${count} review(s)`}
                        />
                      </div>
                      <Text as="span" variant="bodyXs" tone="subdued">{month.slice(5)}</Text>
                    </BlockStack>
                  ))}
                </InlineStack>
              </BlockStack>
            </Card>
          </InlineGrid>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Request funnel</Text>
              <InlineStack gap="400" wrap>
                {(['scheduled', 'sent', 'reviewed', 'skipped', 'bounced'] as const).map((s) => (
                  <BlockStack key={s} gap="050">
                    <Text as="span" variant="headingLg" fontWeight="bold">
                      {String(a.requestCounts[s] ?? 0)}
                    </Text>
                    <Text as="span" variant="bodySm" tone="subdued">{s}</Text>
                  </BlockStack>
                ))}
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Top reviewed products</Text>
              <Divider />
              {a.topProducts.length === 0 ? (
                <Text as="p" tone="subdued">No rated products yet.</Text>
              ) : (
                <DataTable
                  columnContentTypes={['text', 'numeric', 'numeric']}
                  headings={['Product (ID)', 'Avg rating', 'Reviews']}
                  rows={a.topProducts.map((p) => [p.title, `${p.ratingValue} ★`, p.reviewCount])}
                />
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
