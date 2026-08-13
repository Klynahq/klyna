import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/node';
import { Form, Link, useActionData, useLoaderData, useNavigation } from '@remix-run/react';
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  InlineStack,
  Layout,
  Page,
  Text,
} from '@shopify/polaris';
import prisma from '../db.server';
import { useEmbeddedRoute } from '../lib/embedded-routes';
import { getShopPlan, planSelectionUrl } from '../lib/plans.server';
import { syncWaitlistedVariants } from '../services/inventory.server';
import { flushVariant, storefrontProductUrl } from '../services/waitlist.server';
import { authenticate } from '../shopify.server';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  // Real KPIs straight from the waitlist store.
  const [pending, notified, alertsSent, alertsFailed, topVariants, planHandle] = await Promise.all([
    prisma.subscription.count({ where: { shop, status: 'PENDING' } }),
    prisma.subscription.count({ where: { shop, status: 'NOTIFIED' } }),
    prisma.alert.count({ where: { shop, status: 'SENT' } }),
    prisma.alert.count({ where: { shop, status: 'FAILED' } }),
    prisma.subscription.groupBy({
      by: ['variantId'],
      where: { shop, status: 'PENDING' },
      _count: { variantId: true },
      orderBy: { _count: { variantId: 'desc' } },
      take: 5,
    }),
    getShopPlan(shop, admin),
  ]);

  // Hydrate the top variants with their cached titles for display.
  const variantIds = topVariants.map((t) => t.variantId);
  const [snapshots, subscriptions] = await Promise.all([
    prisma.variantSnapshot.findMany({
      where: { shop, variantId: { in: variantIds } },
    }),
    prisma.subscription.findMany({
      where: { shop, status: 'PENDING', variantId: { in: variantIds } },
      distinct: ['variantId'],
      select: { variantId: true, productTitle: true, variantTitle: true },
    }),
  ]);
  const titleFor = (id: string) => {
    const snap = snapshots.find((s) => s.variantId === id);
    const subscription = subscriptions.find((candidate) => candidate.variantId === id);
    return (
      [
        snap?.productTitle ?? subscription?.productTitle,
        snap?.variantTitle ?? subscription?.variantTitle,
      ]
        .filter(Boolean)
        .join(' — ') || 'Product details unavailable'
    );
  };

  const top = topVariants.map((t) => {
    const snap = snapshots.find((s) => s.variantId === t.variantId);
    return {
      variantId: t.variantId,
      title: titleFor(t.variantId),
      count: t._count.variantId,
      available: snap?.available ?? null,
      inStock: snap?.inStock ?? false,
      productUrl: storefrontProductUrl(shop, snap?.productHandle),
    };
  });

  return {
    shop,
    pending,
    notified,
    alertsSent,
    alertsFailed,
    top,
    planHandle,
    pricingUrl: planSelectionUrl(shop),
    themeEditorUrl: `https://admin.shopify.com/store/${shop.replace('.myshopify.com', '')}/themes/current/editor`,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();
  const intent = String(form.get('intent') ?? '');

  if (intent === 'sync') {
    try {
      const result = await syncWaitlistedVariants(admin, shop);
      return json({
        ok: true,
        message: `Checked stock for ${result.synced} variant(s) and sent ${result.alertsSent} alert(s).`,
      });
    } catch (error) {
      console.error('[restock-dashboard-sync-error]', error);
      return json({
        ok: false,
        message: 'Shopify could not refresh inventory right now. Try again from the demand report.',
      });
    }
  }

  if (intent === 'flush') {
    const variantId = String(form.get('variantId') ?? '');
    if (!variantId) return json({ ok: false, message: 'Missing variant.' }, { status: 400 });
    const result = await flushVariant(shop, variantId);
    return json({
      ok: true,
      message:
        result.sent > 0
          ? `Sent ${result.sent} alert(s) for this variant.`
          : 'No alerts sent. There are no eligible subscribers or alerts are paused.',
    });
  }

  return json({ ok: false, message: 'Unknown action.' }, { status: 400 });
};

export default function Dashboard() {
  const {
    shop,
    pending,
    notified,
    alertsSent,
    alertsFailed,
    top,
    planHandle,
    pricingUrl,
    themeEditorUrl,
  } = useLoaderData<typeof loader>();
  const data = useActionData<typeof action>();
  const nav = useNavigation();
  const embeddedRoute = useEmbeddedRoute();
  const busy = nav.state !== 'idle';
  const syncing = busy && nav.formData?.get('intent') === 'sync';

  const stats = [
    { label: 'On waitlists', value: pending, hint: 'Shoppers waiting on a restock' },
    { label: 'Notified', value: notified, hint: 'Shoppers alerted when stock returned' },
    { label: 'Alerts sent', value: alertsSent, hint: 'Successful deliveries' },
    { label: 'Failed', value: alertsFailed, hint: 'Deliveries that errored' },
  ];

  const tiles = [
    {
      title: 'Demand report',
      body: 'See which sold-out variants have the most shoppers waiting — your highest-leverage restocks, ranked.',
      to: '/app/demand',
      ai: false,
    },
    {
      title: 'Smart timing',
      body: 'Fire restock alerts when each shopper is actually awake. Rule-based per-customer timezone routing, optional AI-drafted subject lines.',
      to: '/app/timing',
      ai: true,
    },
    {
      title: 'Subscribers',
      body: 'Browse, filter, and export every waitlist signup. Remove contacts or re-arm them by hand.',
      to: '/app/subscribers',
      ai: false,
    },
    {
      title: 'Settings',
      body: 'Open the Shopify theme editor for widget copy and manage delivery providers, AI, and resend protection.',
      to: '/app/settings',
      ai: false,
    },
  ];
  const recoveryScore = Math.min(
    100,
    Math.round(
      (pending > 0 ? 42 : 20) +
        Math.min(alertsSent, 40) +
        Math.min(notified, 20) -
        Math.min(alertsFailed * 8, 24),
    ),
  );
  const firstInStock = top.find((t) => t.inStock);
  const nextAction = firstInStock
    ? {
        title: `${firstInStock.title} is ready to alert`,
        body: `${firstInStock.count} shopper${firstInStock.count === 1 ? '' : 's'} can be notified from this dashboard.`,
      }
    : pending > 0
      ? {
          title: 'Check inventory before the next drop',
          body: 'Reconcile Shopify stock now to catch products that returned while webhooks were delayed.',
        }
      : {
          title: 'Install the Notify me block',
          body: 'Capture demand on sold-out variants so the next restock has an audience waiting.',
        };

  return (
    <Page title="Klyna Back-in-Stock" subtitle={`Connected to ${shop}`}>
      <Layout>
        {planHandle === 'free' && (
          <Layout.Section>
            <Banner
              tone="info"
              title="Free plan: 50 active waitlist subscribers"
              action={{ content: 'View Growth plan', url: pricingUrl }}
            >
              <Text as="p">
                Upgrade for unlimited demand capture, CSV export, smart timing, and AI assistance.
              </Text>
            </Banner>
          </Layout.Section>
        )}
        <Layout.Section>
          <div className="KlynaDashboardLead">
            <div className="KlynaDashboardLead__copy">
              <InlineStack gap="200" blockAlign="center">
                <p className="KlynaEyebrow">Demand recovery</p>
                <Badge tone={planHandle === 'growth' ? 'success' : 'info'}>
                  {planHandle === 'growth' ? 'Growth' : 'Free'}
                </Badge>
              </InlineStack>
              <h2 className="KlynaLeadTitle">
                Recover revenue before stockouts become lost customers.
              </h2>
              <p className="KlynaLeadBody">
                Klyna adds a Notify me block to sold-out variants, ranks hidden demand by product,
                and sends guarded alerts the moment inventory returns.
              </p>
              <div className="KlynaSignalRow" aria-label="Back-in-stock workload summary">
                <span>
                  <strong>{pending}</strong> waiting
                </span>
                <span>
                  <strong>{notified}</strong> notified
                </span>
                <span>
                  <strong>{alertsFailed}</strong> failed
                </span>
              </div>
              <div className="KlynaActions">
                <Form method="post">
                  <input type="hidden" name="intent" value="sync" />
                  <Button submit variant="primary" loading={syncing}>
                    Check stock now
                  </Button>
                </Form>
                <Button url={themeEditorUrl} target="_top">
                  Open theme editor
                </Button>
              </div>
            </div>
            <div className="KlynaHealthPanel">
              <div className="KlynaScore">
                <span className="KlynaScore__label">Recovery readiness</span>
                <span className="KlynaScore__value">
                  <strong>{recoveryScore}</strong>
                  <span className="KlynaScore__total">/ 100</span>
                </span>
                <span className="KlynaScore__track">
                  <span className="KlynaScore__fill" style={{ width: `${recoveryScore}%` }} />
                </span>
              </div>
              <div className="KlynaNextAction">
                <span className="KlynaNextAction__label">Next best move</span>
                <strong>{nextAction.title}</strong>
                <p>{nextAction.body}</p>
              </div>
            </div>
          </div>
        </Layout.Section>

        {data?.message && (
          <Layout.Section>
            <Card>
              <Text as="p" tone={data.ok ? 'success' : 'critical'}>
                {data.message}
              </Text>
            </Card>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card padding="0">
            <div className="KlynaMetricStrip">
              {stats.map((s) => (
                <div className="KlynaMetric" key={s.label}>
                  <span className="KlynaMetric__label">{s.label}</span>
                  <strong
                    className={`KlynaMetric__value${s.label === 'Failed' && s.value > 0 ? ' KlynaMetric__value--critical' : ''}`}
                  >
                    {String(s.value)}
                  </strong>
                  <span className="KlynaMetric__label">{s.hint}</span>
                </div>
              ))}
            </div>
          </Card>
        </Layout.Section>

        {top.length > 0 && (
          <Layout.Section>
            <Card padding="0">
              <Box padding="400" paddingBlockEnd="0">
                <div className="KlynaSectionHeader">
                  <div>
                    <h2>Most-wanted right now</h2>
                    <p>Variants with the highest waitlists, ready to reconcile or notify.</p>
                  </div>
                  <Link to={embeddedRoute('/app/demand')}>Full report</Link>
                </div>
              </Box>
              <Box padding="400">
                <BlockStack gap="200">
                  {top.map((t) => (
                    <div
                      className="KlynaFinding"
                      data-severity={t.inStock ? 'success' : 'warning'}
                      key={t.variantId}
                    >
                      <InlineStack align="space-between" blockAlign="center">
                        <BlockStack gap="050">
                          <Text as="span" variant="bodyMd" fontWeight="semibold">
                            {t.title}
                          </Text>
                          <InlineStack gap="200" blockAlign="center">
                            <Badge tone="attention">{`${t.count} waiting`}</Badge>
                            {t.inStock ? (
                              <Badge tone="success">
                                {`In stock${t.available != null ? ` · ${t.available}` : ''}`}
                              </Badge>
                            ) : (
                              <Badge tone="critical">Sold out</Badge>
                            )}
                          </InlineStack>
                        </BlockStack>
                        <InlineStack gap="200" blockAlign="center">
                          <Button url={t.productUrl} target="_blank">
                            View product
                          </Button>
                          <Form method="post">
                            <input type="hidden" name="intent" value="flush" />
                            <input type="hidden" name="variantId" value={t.variantId} />
                            <Button
                              submit
                              disabled={!t.inStock}
                              loading={busy && nav.formData?.get('variantId') === t.variantId}
                            >
                              Notify now
                            </Button>
                          </Form>
                        </InlineStack>
                      </InlineStack>
                    </div>
                  ))}
                </BlockStack>
              </Box>
            </Card>
          </Layout.Section>
        )}

        <Layout.Section>
          <div className="KlynaSectionHeader">
            <div>
              <h2>Recovery workspace</h2>
              <p>
                Every shortcut opens a real workflow for demand, delivery, subscribers, or setup.
              </p>
            </div>
          </div>
          <div className="KlynaToolGrid">
            {tiles.map((t) => (
              <Link className="KlynaShortcut" key={t.to} to={embeddedRoute(t.to)}>
                <InlineStack gap="200" blockAlign="center">
                  <Text as="h3" variant="headingSm">
                    {t.title}
                  </Text>
                  {t.ai && <Badge tone="info">AI</Badge>}
                </InlineStack>
                <small>{t.body}</small>
              </Link>
            ))}
          </div>
        </Layout.Section>

        <Layout.Section>
          <div className="KlynaPlanBar">
            <div className="KlynaPlanBar__copy">
              <Text as="h3" variant="headingSm">
                Turn on the storefront button
              </Text>
              <p>
                Add the Klyna Notify me app block to a product template. It renders only when the
                selected variant is sold out, so the storefront stays clean.
              </p>
            </div>
            <Button url={themeEditorUrl} target="_top">
              Open theme editor
            </Button>
          </div>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
