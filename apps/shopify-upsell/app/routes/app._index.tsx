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
import { getShopStats } from '../models/offers.server';
import { formatMoney } from '../lib/format';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const [{ totals }, offerCount, activeCount] = await Promise.all([
    getShopStats(session.shop),
    prisma.offer.count({ where: { shop: session.shop } }),
    prisma.offer.count({ where: { shop: session.shop, enabled: true } }),
  ]);
  return { shop: session.shop, totals, offerCount, activeCount };
};

export default function Dashboard() {
  const { shop, totals, offerCount, activeCount } = useLoaderData<typeof loader>();

  const metrics = [
    { label: 'Offers live', value: String(activeCount), hint: `${offerCount} total` },
    { label: 'Impressions', value: totals.impressions.toLocaleString() },
    {
      label: 'Accept rate',
      value: `${(totals.conversionRate * 100).toFixed(1)}%`,
      hint: `${totals.accepts.toLocaleString()} accepts`,
    },
    {
      label: 'Upsell revenue',
      value: formatMoney(totals.revenue),
      hint: `${totals.conversions.toLocaleString()} converted`,
    },
  ];

  const tiles = [
    {
      title: 'Offers',
      body: 'Build rules that trigger upsells by product, collection, or cart value. A/B test two recommendations head to head.',
      to: '/app/offers',
      ai: false,
    },
    {
      title: 'AI headlines',
      body: 'Generate three headline variants for any offer, tuned to live inventory and cart context. Pick one and ship it.',
      to: '/app/offers',
      ai: true,
    },
    {
      title: 'Analytics',
      body: 'Impressions, accept rate, conversions, and attributed revenue per offer and per A/B variant.',
      to: '/app/analytics',
      ai: false,
    },
    {
      title: 'Settings',
      body: 'Cart widget theme extension, post-purchase placement, and the AI assistant.',
      to: '/app/settings',
      ai: false,
    },
  ];

  return (
    <Page title="Klyna Upsell" subtitle={`Connected to ${shop}`}>
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">Raise revenue per order.</Text>
                <Badge tone={activeCount > 0 ? 'success' : 'attention'}>
                  {activeCount > 0 ? 'Active' : 'No live offers'}
                </Badge>
              </InlineStack>
              <Text as="p" variant="bodyMd" tone="subdued">
                Klyna Upsell shows the right cross-sell at the right moment — in
                the cart drawer and on the post-purchase page — then measures
                exactly what each offer earned you. Start by creating an offer.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="300">
            {metrics.map((m) => (
              <Card key={m.label}>
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">{m.label}</Text>
                  <Text as="p" variant="headingLg" fontWeight="bold">{m.value}</Text>
                  {m.hint && (
                    <Text as="p" variant="bodySm" tone="subdued">{m.hint}</Text>
                  )}
                </BlockStack>
              </Card>
            ))}
          </InlineGrid>
        </Layout.Section>

        <Layout.Section>
          <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="300">
            {tiles.map((t) => (
              <Card key={t.title}>
                <BlockStack gap="200">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h3" variant="headingSm">{t.title}</Text>
                    {t.ai && <Badge tone="info">AI</Badge>}
                  </InlineStack>
                  <Text as="p" variant="bodyMd" tone="subdued">{t.body}</Text>
                  <Box paddingBlockStart="100">
                    <Link to={t.to}>Open</Link>
                  </Box>
                </BlockStack>
              </Card>
            ))}
          </InlineGrid>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
