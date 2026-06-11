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
import { conversionRate } from '../lib/popups';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [activePopups, totalPopups, subscribers, impressions, conversions] =
    await Promise.all([
      prisma.popup.count({ where: { shop, status: 'active' } }),
      prisma.popup.count({ where: { shop } }),
      prisma.subscriber.count({ where: { shop } }),
      prisma.popupEvent.count({
        where: { shop, type: 'impression', createdAt: { gte: since } },
      }),
      prisma.popupEvent.count({
        where: { shop, type: 'conversion', createdAt: { gte: since } },
      }),
    ]);

  return {
    shop,
    stats: {
      activePopups,
      totalPopups,
      subscribers,
      impressions,
      conversions,
      rate: conversionRate(conversions, impressions),
    },
  };
};

export default function Dashboard() {
  const { shop, stats } = useLoaderData<typeof loader>();

  const metrics = [
    { label: 'Active popups', value: String(stats.activePopups) },
    { label: 'Subscribers', value: stats.subscribers.toLocaleString() },
    { label: 'Impressions · 30d', value: stats.impressions.toLocaleString() },
    { label: 'Conversion rate · 30d', value: `${stats.rate}%` },
  ];

  const tiles = [
    {
      title: 'Build a popup',
      body: 'Email/SMS capture, spin-to-win, exit-intent — with scroll and time triggers and per-page targeting.',
      to: '/app/popups',
    },
    {
      title: 'Subscribers',
      body: 'Every opt-in, written to Shopify customers with marketing consent. Track sync status and export.',
      to: '/app/subscribers',
    },
    {
      title: 'Conversion analytics',
      body: 'Impressions, conversions, and rate per campaign — see which popup actually grows your list.',
      to: '/app/analytics',
    },
  ];

  return (
    <Page title="Klyna Capture" subtitle={`Connected to ${shop}`}>
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">Grow your list, the honest way.</Text>
                <Badge tone={stats.activePopups > 0 ? 'success' : 'attention'}>
                  {stats.activePopups > 0 ? 'Live' : 'No live popups'}
                </Badge>
              </InlineStack>
              <Text as="p" variant="bodyMd" tone="subdued">
                Capture writes opt-ins straight into Shopify customers with email
                and SMS marketing consent — no per-impression billing, no data
                leaving your store. Pick a module to get started.
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
                  <Text as="h3" variant="headingSm">{t.title}</Text>
                  <Text as="p" variant="bodyMd" tone="subdued">{t.body}</Text>
                  <Link to={t.to}>Open →</Link>
                </BlockStack>
              </Card>
            ))}
          </InlineGrid>
        </Layout.Section>

        {stats.totalPopups === 0 && (
          <Layout.Section>
            <Card>
              <Box padding="200">
                <BlockStack gap="200">
                  <Text as="h3" variant="headingSm">Get started</Text>
                  <Text as="p" tone="subdued">
                    Create your first popup, then enable the Klyna Capture app
                    embed in your theme so it shows on the storefront.
                  </Text>
                  <Link to="/app/popups">Create a popup →</Link>
                </BlockStack>
              </Box>
            </Card>
          </Layout.Section>
        )}
      </Layout>
    </Page>
  );
}
