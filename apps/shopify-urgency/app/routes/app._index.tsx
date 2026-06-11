import { type LoaderFunctionArgs } from '@remix-run/node';
import { Link, useLoaderData } from '@remix-run/react';
import {
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
import { ctr, totalsForShop } from '../lib/analytics.server';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const [timers, scarcity, proof, totals] = await Promise.all([
    prisma.countdownTimer.count({ where: { shop, enabled: true } }),
    prisma.scarcityRule.count({ where: { shop, enabled: true } }),
    prisma.socialProofConfig.findUnique({ where: { shop } }),
    totalsForShop(shop, 30),
  ]);

  return {
    shop,
    counts: { timers, scarcity, proofOn: Boolean(proof?.enabled) },
    totals,
  };
};

export default function Dashboard() {
  const { shop, counts, totals } = useLoaderData<typeof loader>();

  const tiles = [
    {
      title: 'Countdown timers',
      body: 'Schedule sale and launch countdowns. Auto-hide or swap to a message when the clock hits zero.',
      to: '/app/timers',
      meta: `${counts.timers} active`,
    },
    {
      title: 'Stock scarcity',
      body: 'Show “Only N left” badges wired to your real inventory. Set thresholds per product or store-wide.',
      to: '/app/scarcity',
      meta: `${counts.scarcity} active`,
    },
    {
      title: 'Social proof',
      body: 'Recently-purchased popups built from your synced orders. Privacy-safe — first name + city only.',
      to: '/app/social-proof',
      meta: counts.proofOn ? 'On' : 'Off',
    },
  ];

  const stats = [
    { label: 'Impressions (30d)', value: totals.views.toLocaleString() },
    { label: 'Clicks (30d)', value: totals.clicks.toLocaleString() },
    { label: 'Click-through rate', value: `${ctr(totals)}%` },
  ];

  return (
    <Page
      title="Klyna Urgency"
      subtitle={`Connected to ${shop}`}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">Turn browsers into buyers.</Text>
              <Text as="p" variant="bodyMd" tone="subdued">
                Countdown timers, low-stock scarcity, and live social-proof popups —
                lightweight, theme-native, and free to start. Add the Klyna Urgency
                blocks in your theme editor, then configure them here.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <InlineGrid columns={{ xs: 1, sm: 3 }} gap="300">
            {stats.map((s) => (
              <Card key={s.label}>
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">{s.label}</Text>
                  <Text as="p" variant="heading2xl" fontWeight="bold">{s.value}</Text>
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
                    <Box>
                      <Text as="span" variant="bodySm" tone="subdued">{t.meta}</Text>
                    </Box>
                  </InlineStack>
                  <Text as="p" variant="bodyMd" tone="subdued">{t.body}</Text>
                  <Link to={t.to}>Open →</Link>
                </BlockStack>
              </Card>
            ))}
          </InlineGrid>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text as="h3" variant="headingSm">Finish setup</Text>
              <Text as="p" variant="bodyMd" tone="subdued">
                1. Open your theme editor → Add block → search “Klyna Urgency”.
                2. Drop the Countdown, Scarcity, or Social Proof block where you want it.
                3. Configure rules and targeting on this dashboard. Changes go live instantly.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
