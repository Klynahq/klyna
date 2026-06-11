import { type LoaderFunctionArgs } from '@remix-run/node';
import { Link, useLoaderData } from '@remix-run/react';
import {
  BlockStack,
  Badge,
  Box,
  Card,
  Divider,
  InlineGrid,
  InlineStack,
  Layout,
  Page,
  Text,
} from '@shopify/polaris';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';
import { getShopInfo } from '../lib/admin.server';
import { money } from '../lib/pricing';

const WINDOW_DAYS = 30;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const [shopInfo, sales, activeBundles, draftBundles, volumeCount, fbtCount] =
    await Promise.all([
      getShopInfo(admin).catch(() => null),
      prisma.bundleSale.findMany({
        where: { shop, soldAt: { gte: since } },
        orderBy: { soldAt: 'desc' },
      }),
      prisma.bundle.count({ where: { shop, status: 'active' } }),
      prisma.bundle.count({ where: { shop, status: 'draft' } }),
      prisma.volumeTier.count({ where: { shop } }),
      prisma.fbtPair.count({ where: { shop } }),
    ]);

  const revenue = money(sales.reduce((s, r) => s + r.grossAmount, 0));
  const discounts = money(sales.reduce((s, r) => s + r.discountAmount, 0));
  const orders = new Set(sales.map((r) => r.orderGid)).size;
  const unitsSold = sales.reduce((s, r) => s + r.itemsSold, 0);
  const aov = orders > 0 ? money(revenue / orders) : 0;

  // Revenue split by source for the breakdown card.
  const bySource = { bundle: 0, volume: 0, fbt: 0 } as Record<string, number>;
  for (const r of sales) bySource[r.source] = (bySource[r.source] ?? 0) + r.grossAmount;

  return {
    shop,
    currency: shopInfo?.currencyCode ?? 'USD',
    metrics: { revenue, discounts, orders, unitsSold, aov },
    bySource: {
      bundle: money(bySource.bundle),
      volume: money(bySource.volume),
      fbt: money(bySource.fbt),
    },
    counts: { activeBundles, draftBundles, volumeCount, fbtCount },
    hasData: sales.length > 0,
  };
};

function fmt(amount: number, currency: string) {
  return new Intl.NumberFormat('en', { style: 'currency', currency }).format(amount);
}

export default function Dashboard() {
  const { shop, currency, metrics, bySource, counts, hasData } =
    useLoaderData<typeof loader>();

  const stats = [
    { label: `Bundle revenue · ${WINDOW_DAYS}d`, value: fmt(metrics.revenue, currency) },
    { label: 'Attributed orders', value: String(metrics.orders) },
    { label: 'Avg. order value', value: fmt(metrics.aov, currency) },
    { label: 'Discount given', value: fmt(metrics.discounts, currency) },
  ];

  const tiles = [
    {
      title: 'Bundles',
      body: 'Build fixed sets or mix-and-match bundles and apply a percentage or fixed discount.',
      to: '/app/bundles',
      badge: counts.activeBundles > 0 ? `${counts.activeBundles} active` : undefined,
    },
    {
      title: 'Volume discounts',
      body: 'Add quantity-break tiers — buy more, save more — enforced with native automatic discounts.',
      to: '/app/volume',
      badge: counts.volumeCount > 0 ? `${counts.volumeCount} tiers` : undefined,
    },
    {
      title: 'Frequently bought together',
      body: 'Mine order history for product pairs and surface them on the product page.',
      to: '/app/fbt',
      badge: counts.fbtCount > 0 ? `${counts.fbtCount} pairs` : undefined,
    },
  ];

  return (
    <Page
      title="Klyna Bundles"
      subtitle={`Connected to ${shop}`}
      primaryAction={{ content: 'New bundle', url: '/app/bundles/new' }}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">Lift AOV with bundles & volume breaks.</Text>
              <Text as="p" variant="bodyMd" tone="subdued">
                Klyna Bundles turns single-item carts into bigger orders — curated
                bundles, quantity discounts, and data-driven recommendations, all
                shown on the product page with the savings spelled out.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <InlineGrid columns={{ xs: 2, md: 4 }} gap="300">
            {stats.map((s) => (
              <Card key={s.label}>
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">{s.label}</Text>
                  <Text as="p" variant="headingLg" fontWeight="bold">{s.value}</Text>
                </BlockStack>
              </Card>
            ))}
          </InlineGrid>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Revenue by source · last {WINDOW_DAYS} days</Text>
              {hasData ? (
                <BlockStack gap="200">
                  <RevenueRow label="Bundles" value={bySource.bundle} total={metrics.revenue} currency={currency} />
                  <RevenueRow label="Volume breaks" value={bySource.volume} total={metrics.revenue} currency={currency} />
                  <RevenueRow label="Frequently bought together" value={bySource.fbt} total={metrics.revenue} currency={currency} />
                  <Divider />
                  <InlineStack align="space-between">
                    <Text as="span" variant="bodyMd" tone="subdued">{metrics.unitsSold} units sold across {metrics.orders} orders</Text>
                    <Text as="span" variant="bodyMd" fontWeight="semibold">{fmt(metrics.revenue, currency)}</Text>
                  </InlineStack>
                </BlockStack>
              ) : (
                <Text as="p" tone="subdued">
                  No bundle-attributed sales yet. Once a bundle, volume tier, or FBT
                  recommendation converts, revenue shows up here. Sales are recorded
                  from the orders webhook (or the recompute on each feature page).
                </Text>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <InlineGrid columns={{ xs: 1, md: 3 }} gap="300">
            {tiles.map((t) => (
              <Card key={t.to}>
                <BlockStack gap="200">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h3" variant="headingSm">{t.title}</Text>
                    {t.badge && <Badge tone="success">{t.badge}</Badge>}
                  </InlineStack>
                  <Text as="p" variant="bodyMd" tone="subdued">{t.body}</Text>
                  <Link to={t.to}>Open →</Link>
                </BlockStack>
              </Card>
            ))}
          </InlineGrid>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

function RevenueRow({
  label,
  value,
  total,
  currency,
}: {
  label: string;
  value: number;
  total: number;
  currency: string;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <BlockStack gap="100">
      <InlineStack align="space-between">
        <Text as="span" variant="bodyMd">{label}</Text>
        <Text as="span" variant="bodyMd" fontWeight="semibold">{fmt(value, currency)}</Text>
      </InlineStack>
      <Box
        background="bg-surface-secondary"
        borderRadius="100"
        minHeight="6px"
        width="100%"
      >
        <Box
          background="bg-fill-brand"
          borderRadius="100"
          minHeight="6px"
          width={`${pct}%`}
        />
      </Box>
    </BlockStack>
  );
}
