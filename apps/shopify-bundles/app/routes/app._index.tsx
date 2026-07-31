import type { LoaderFunctionArgs } from '@remix-run/node';
import { Link, useLoaderData } from '@remix-run/react';
import {
  Badge,
  BlockStack,
  Button,
  Card,
  Divider,
  Icon,
  InlineStack,
  Layout,
  Page,
  Text,
} from '@shopify/polaris';
import { DiscountIcon, ProductIcon } from '@shopify/polaris-icons';
import type { CSSProperties } from 'react';
import prisma from '../db.server';
import { getShopInfo } from '../lib/admin.server';
import { useEmbeddedRoute } from '../lib/embedded-routes';
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
  const embeddedRoute = useEmbeddedRoute();

  const stats = [
    { label: 'Active bundles', value: String(counts.activeBundles) },
    { label: 'Draft bundles', value: String(counts.draftBundles) },
    { label: 'Volume tier products', value: String(counts.volumeCount) },
    { label: 'Current plan', value: plan.label },
  ];

  const tiles = [
    {
      icon: ProductIcon,
      title: 'Bundles',
      body: 'Create fixed sets or mix-and-match offers with percentage or fixed savings.',
      to: '/app/bundles',
      badge: counts.activeBundles > 0 ? `${counts.activeBundles} active` : undefined,
    },
    {
      icon: DiscountIcon,
      title: 'Volume discounts',
      body: 'Create quantity breaks that Shopify enforces with native automatic discounts.',
      to: '/app/volume',
      badge: counts.volumeCount > 0 ? `${counts.volumeCount} tiers` : undefined,
    },
  ];

  return (
    <Page title="Bundles overview" subtitle={`Klyna Bundles | ${shop}`}>
      <Layout>
        <Layout.Section>
          <div className="KlynaDashboardLead">
            <div className="KlynaDashboardLead__copy">
              <p className="KlynaEyebrow">Offer workspace</p>
              <h2 className="KlynaLeadTitle">
                Build offers shoppers understand and Shopify enforces
              </h2>
              <p className="KlynaLeadBody">
                Create curated bundles and quantity breaks, place them on product pages, and manage
                every active offer from one workspace.
              </p>
              <div className="KlynaActions">
                <Button url={embeddedRoute('/app/bundles/new')} variant="primary">
                  Create bundle
                </Button>
                <Button url={embeddedRoute('/app/volume')}>Create volume discount</Button>
              </div>
            </div>
            <div className="KlynaScore KlynaScore--stat">
              <span className="KlynaScore__label">Active offers</span>
              <span className="KlynaScore__value">
                <strong>{counts.activeBundles + counts.volumeCount}</strong>
              </span>
              <span className="KlynaScore__total">
                {counts.draftBundles} draft{counts.draftBundles === 1 ? '' : 's'}
              </span>
            </div>
          </div>
        </Layout.Section>

        <Layout.Section>
          <Card padding="0">
            <div className="KlynaMetricStrip">
              {stats.map((stat, index) => (
                <div className="KlynaMetric" key={stat.label}>
                  <span className="KlynaMetric__label">{stat.label}</span>
                  <strong
                    className={`KlynaMetric__value${index === 0 ? ' KlynaMetric__value--data' : ''}`}
                  >
                    {stat.value}
                  </strong>
                </div>
              ))}
            </div>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <div className="KlynaPlanBar">
            <div className="KlynaPlanBar__copy">
              <InlineStack gap="200" blockAlign="center">
                <Text as="h2" variant="headingSm">
                  Current plan
                </Text>
                <Badge tone={plan.paid ? 'success' : 'attention'}>{plan.label}</Badge>
              </InlineStack>
              <p>Starter includes one bundle. Paid plans add more offers and volume tiers.</p>
            </div>
            {!plan.paid && (
              <a className="KlynaButtonLink" href={upgradeUrl} target="_top" rel="noreferrer">
                View plans
              </a>
            )}
          </div>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                {hasData ? `Offer revenue, last ${WINDOW_DAYS} days` : 'Publish your first offer'}
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
                <ol className="KlynaChecklist">
                  <li>Create a bundle or set quantity-break tiers.</li>
                  <li>Add the Klyna Bundles app block to the matching product template.</li>
                  <li>Preview the storefront and confirm the automatic discount in Shopify.</li>
                </ol>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <div className="KlynaSectionHeader">
            <div>
              <h2>Manage offers</h2>
              <p>Create, publish, and update offers without leaving Shopify admin.</p>
            </div>
          </div>
          <div className="KlynaToolGrid">
            {tiles.map((tile) => (
              <Link className="KlynaToolLink" key={tile.to} to={embeddedRoute(tile.to)}>
                <span className="KlynaToolLink__icon">
                  <Icon source={tile.icon} />
                </span>
                <span className="KlynaToolLink__content">
                  <span className="KlynaToolLink__title">{tile.title}</span>
                  <span className="KlynaToolLink__body">{tile.body}</span>
                  {tile.badge && <span className="KlynaInlineBadge">{tile.badge}</span>}
                  <span className="KlynaToolLink__action">Open workspace</span>
                </span>
              </Link>
            ))}
          </div>
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
      <span className="KlynaRevenueTrack">
        <span
          className="KlynaRevenueTrack__fill"
          style={{ '--revenue-share': `${pct}%` } as CSSProperties}
        />
      </span>
    </BlockStack>
  );
}
