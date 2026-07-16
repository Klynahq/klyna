import type { LoaderFunctionArgs } from '@remix-run/node';
import { Link, useLoaderData } from '@remix-run/react';
import {
  Badge,
  BlockStack,
  Box,
  Card,
  Divider,
  InlineGrid,
  InlineStack,
  Layout,
  Page,
  Text,
} from '@shopify/polaris';
import prisma from '../db.server';
import { getShopInfo } from '../lib/admin.server';
import { getPlanSelectionUrl, getShopPlan } from '../lib/plans.server';
import { money } from '../lib/pricing';
import { authenticate } from '../shopify.server';

const WINDOW_DAYS = 30;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const plan = await getShopPlan(shop, request);

  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const [shopInfo, sales, activeBundles, draftBundles, volumeCount] = await Promise.all([
    getShopInfo(admin).catch(() => null),
    prisma.bundleSale.findMany({
      where: { shop, soldAt: { gte: since } },
      orderBy: { soldAt: 'desc' },
    }),
    prisma.bundle.count({ where: { shop, status: 'active' } }),
    prisma.bundle.count({ where: { shop, status: 'draft' } }),
    prisma.volumeTier.count({ where: { shop } }),
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
      bundle: money(bySource.bundle ?? 0),
      volume: money(bySource.volume ?? 0),
      fbt: money(bySource.fbt ?? 0),
    },
    counts: { activeBundles, draftBundles, volumeCount },
    plan,
    upgradeUrl: getPlanSelectionUrl(shop),
    hasData: sales.length > 0,
  };
};

function fmt(amount: number, currency: string) {
  return new Intl.NumberFormat('en', { style: 'currency', currency }).format(amount);
}

export default function Dashboard() {
  const { shop, currency, metrics, bySource, counts, plan, upgradeUrl, hasData } =
    useLoaderData<typeof loader>();

  const stats = [
    { label: 'Active bundles', value: String(counts.activeBundles) },
    { label: 'Draft bundles', value: String(counts.draftBundles) },
    { label: 'Volume tier products', value: String(counts.volumeCount) },
    { label: 'Current plan', value: plan.label },
  ];

  const tiles: {
    title: string;
    body: string;
    to: string;
    badge?: string;
    ai?: boolean;
  }[] = [
    {
      title: 'Bundles',
      body: 'Build fixed sets or mix-and-match bundles and apply a percentage or fixed discount.',
      to: '/app/bundles',
      badge: counts.activeBundles > 0 ? `${counts.activeBundles} active` : undefined,
    },
    {
      title: 'Volume discounts',
      body: 'Add quantity-break tiers - buy more, save more - enforced with native automatic discounts.',
      to: '/app/volume',
      badge: counts.volumeCount > 0 ? `${counts.volumeCount} tiers` : undefined,
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
              <Text as="h2" variant="headingMd">
                Create bundles and quantity breaks from one dashboard.
              </Text>
              <Text as="p" variant="bodyMd" tone="subdued">
                Klyna Bundles helps merchants build curated bundles and quantity discounts, show
                them on product pages, and apply savings with native automatic discounts. The launch
                build works without protected order or customer data.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <InlineStack align="space-between" blockAlign="center" gap="300">
              <BlockStack gap="100">
                <InlineStack gap="200" blockAlign="center">
                  <Text as="h2" variant="headingMd">
                    Plan
                  </Text>
                  <Badge tone={plan.paid ? 'success' : 'attention'}>{plan.label}</Badge>
                </InlineStack>
                <Text as="p" variant="bodyMd" tone="subdued">
                  Starter includes one bundle. Growth and Pro unlock more bundles plus
                  quantity-break tiers for paid merchants.
                </Text>
              </BlockStack>
              {!plan.paid && (
                <a href={upgradeUrl} target="_top" rel="noreferrer">
                  View paid plans
                </a>
              )}
            </InlineStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <InlineGrid columns={{ xs: 2, md: 4 }} gap="300">
            {stats.map((s) => (
              <Card key={s.label}>
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">
                    {s.label}
                  </Text>
                  <Text as="p" variant="headingLg" fontWeight="bold">
                    {s.value}
                  </Text>
                </BlockStack>
              </Card>
            ))}
          </InlineGrid>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                {hasData ? `Revenue by source · last ${WINDOW_DAYS} days` : 'Launch checklist'}
              </Text>
              {hasData ? (
                <BlockStack gap="200">
                  <RevenueRow
                    label="Bundles"
                    value={bySource.bundle}
                    total={metrics.revenue}
                    currency={currency}
                  />
                  <RevenueRow
                    label="Volume breaks"
                    value={bySource.volume}
                    total={metrics.revenue}
                    currency={currency}
                  />
                  <RevenueRow
                    label="Frequently bought together"
                    value={bySource.fbt}
                    total={metrics.revenue}
                    currency={currency}
                  />
                  <Divider />
                  <InlineStack align="space-between">
                    <Text as="span" variant="bodyMd" tone="subdued">
                      {metrics.unitsSold} units sold across {metrics.orders} orders
                    </Text>
                    <Text as="span" variant="bodyMd" fontWeight="semibold">
                      {fmt(metrics.revenue, currency)}
                    </Text>
                  </InlineStack>
                </BlockStack>
              ) : (
                <BlockStack gap="200">
                  <Text as="p" tone="subdued">
                    Sales attribution is disabled in the approval-safe launch build. Core bundles
                    and volume discounts are ready to test without protected order data.
                  </Text>
                  <Text as="p" variant="bodySm">
                    1. Create a bundle or volume tier. 2. Add the Klyna Bundles app block to a
                    product template. 3. Verify the discount appears under Shopify automatic
                    discounts.
                  </Text>
                </BlockStack>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="300">
            {tiles.map((t) => (
              <Card key={t.to}>
                <BlockStack gap="200">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h3" variant="headingSm">
                      {t.title}
                    </Text>
                    {t.ai ? (
                      <Badge tone="info">AI</Badge>
                    ) : t.badge ? (
                      <Badge tone="success">{t.badge}</Badge>
                    ) : null}
                  </InlineStack>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    {t.body}
                  </Text>
                  <Link to={t.to}>Open</Link>
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
        <Text as="span" variant="bodyMd">
          {label}
        </Text>
        <Text as="span" variant="bodyMd" fontWeight="semibold">
          {fmt(value, currency)}
        </Text>
      </InlineStack>
      <Box background="bg-surface-secondary" borderRadius="100" minHeight="6px" width="100%">
        <Box background="bg-fill-brand" borderRadius="100" minHeight="6px" width={`${pct}%`} />
      </Box>
    </BlockStack>
  );
}
