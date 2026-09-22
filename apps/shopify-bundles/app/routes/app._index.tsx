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
import { recordUsageEvent } from '../lib/usage.server';
import { authenticate } from '../shopify.server';

const WINDOW_DAYS = 30;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const plan = await getShopPlan(shop, request);

  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const [shopInfo, sales, activeBundles, draftBundles, volumeCount, storefrontUsage] =
    await Promise.all([
      getShopInfo(admin).catch(() => null),
      prisma.bundleSale.findMany({
        where: { shop, soldAt: { gte: since } },
        orderBy: { soldAt: 'desc' },
      }),
      prisma.bundle.count({ where: { shop, status: 'active' } }),
      prisma.bundle.count({ where: { shop, status: 'draft' } }),
      prisma.volumeTier.count({ where: { shop } }),
      prisma.usageEvent.count({ where: { shop, event: 'storefront_widget_loaded' } }),
      recordUsageEvent(shop, 'dashboard_viewed'),
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
    activation: {
      offerCreated: activeBundles + draftBundles + volumeCount > 0,
      offerActive: activeBundles + volumeCount > 0,
      storefrontVerified: storefrontUsage > 0,
    },
    plan,
    upgradeUrl: getPlanSelectionUrl(shop),
    hasData: sales.length > 0,
  };
};

function fmt(amount: number, currency: string) {
  return new Intl.NumberFormat('en', { style: 'currency', currency }).format(amount);
}

export default function Dashboard() {
  const { shop, currency, metrics, bySource, counts, activation, plan, upgradeUrl, hasData } =
    useLoaderData<typeof loader>();
  const embeddedRoute = useEmbeddedRoute();
  const activationCount = Object.values(activation).filter(Boolean).length;

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
        {activationCount < 3 && (
          <Layout.Section>
            <section className="KlynaActivation" aria-labelledby="activation-title">
              <div className="KlynaActivation__intro">
                <div>
                  <h2 id="activation-title">Launch your first bundle in about five minutes</h2>
                  <p>
                    Pick two products, choose the saving, then place the Klyna block on the matching
                    product template.
                  </p>
                </div>
                <strong>{activationCount} of 3 complete</strong>
              </div>
              <ol className="KlynaActivation__steps">
                <ActivationStep
                  index={1}
                  complete={activation.offerCreated}
                  label="Create an offer"
                  detail="Choose products and preview the exact checkout saving."
                  action={
                    activation.offerCreated
                      ? undefined
                      : { label: 'Choose products', href: embeddedRoute('/app/bundles/new') }
                  }
                />
                <ActivationStep
                  index={2}
                  complete={activation.offerActive}
                  label="Activate the discount"
                  detail="Klyna creates a native Shopify automatic discount."
                  action={
                    activation.offerCreated && !activation.offerActive
                      ? { label: 'Review draft', href: embeddedRoute('/app/bundles') }
                      : undefined
                  }
                />
                <ActivationStep
                  index={3}
                  complete={activation.storefrontVerified}
                  label="Show it on your product page"
                  detail="Add the Klyna Bundles app block in the theme editor, then preview it."
                  action={
                    activation.offerActive && !activation.storefrontVerified
                      ? {
                          label: 'Open theme editor',
                          href: `https://${shop}/admin/themes/current/editor?context=apps&template=product`,
                          topLevel: true,
                        }
                      : undefined
                  }
                />
              </ol>
            </section>
          </Layout.Section>
        )}

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

function ActivationStep({
  index,
  complete,
  label,
  detail,
  action,
}: {
  index: number;
  complete: boolean;
  label: string;
  detail: string;
  action?: { label: string; href: string; topLevel?: boolean };
}) {
  return (
    <li className={complete ? 'KlynaActivationStep is-complete' : 'KlynaActivationStep'}>
      <span className="KlynaActivationStep__state" aria-hidden="true">
        {index}
      </span>
      <span className="KlynaActivationStep__copy">
        <strong>{label}</strong>
        <span>{detail}</span>
      </span>
      {action && (
        <a
          className="KlynaButtonLink"
          href={action.href}
          target={action.topLevel ? '_top' : undefined}
        >
          {action.label}
        </a>
      )}
    </li>
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
