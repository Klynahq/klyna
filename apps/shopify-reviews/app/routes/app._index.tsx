import type { LoaderFunctionArgs } from '@remix-run/node';
import { Link, useLoaderData } from '@remix-run/react';
import {
  Badge,
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
import { getShopAiSettings } from '../lib/ai.server';
import { useEmbeddedRoute } from '../lib/embedded-routes';
import { planSelectionUrl, syncPlanFromRequest } from '../lib/plans.server';
import { roundRating } from '../lib/reviews.server';
import { authenticate } from '../shopify.server';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const [pending, published, requestsScheduled, ratingAgg, recent, ai, topProduct, planHandle] =
    await Promise.all([
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
      getShopAiSettings(shop),
      prisma.productRating.findFirst({
        where: { shop },
        orderBy: { reviewCount: 'desc' },
        select: { productId: true },
      }),
      syncPlanFromRequest(shop, request),
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
    aiEnabled: planHandle === 'growth' && ai.provider !== 'off' && !!ai.apiKey,
    aiProvider: ai.provider,
    topProductId: topProduct?.productId ?? null,
    planHandle,
    pricingUrl: planSelectionUrl(shop),
  };
};

function statusTone(status: string): 'attention' | 'success' | 'critical' | 'info' {
  if (status === 'published') return 'success';
  if (status === 'pending') return 'attention';
  if (status === 'rejected' || status === 'spam') return 'critical';
  return 'info';
}

function findingSeverity(status: string): 'warning' | 'success' | 'critical' | 'info' {
  if (status === 'published') return 'success';
  if (status === 'pending') return 'warning';
  if (status === 'rejected' || status === 'spam') return 'critical';
  return 'info';
}

export default function Dashboard() {
  const { shop, stats, recent, aiEnabled, aiProvider, topProductId, planHandle, pricingUrl } =
    useLoaderData<typeof loader>();
  const embeddedRoute = useEmbeddedRoute();

  const themesTo = topProductId
    ? `/app/products/${encodeURIComponent(topProductId)}/themes`
    : '/app/settings';

  const tiles: { title: string; body: string; to: string; badge?: string; ai?: boolean }[] = [
    {
      title: 'Moderation queue',
      body: 'Approve, reply to, or reject incoming photo + star reviews before they go live.',
      to: '/app/moderation',
      badge: stats.pending > 0 ? `${stats.pending} waiting` : undefined,
    },
    {
      title: 'Review requests',
      body: 'Buyer email automation is paused in the launch build until protected customer data approval is granted.',
      to: '/app/requests',
      badge: stats.requestsScheduled > 0 ? `${stats.requestsScheduled} scheduled` : undefined,
    },
    {
      title: 'Review themes',
      body: 'Summarize what customers keep mentioning about a product into the top three themes with representative quotes.',
      to: themesTo,
      ai: true,
    },
    {
      title: 'Analytics',
      body: 'Track rating trends, response rate, photo coverage, and top-reviewed products.',
      to: '/app/analytics',
    },
  ];

  const metrics = [
    { label: 'Published reviews', value: String(stats.published) },
    { label: 'Average rating', value: stats.avgRating ? `${stats.avgRating} ★` : '—' },
    { label: 'Awaiting moderation', value: String(stats.pending) },
    { label: 'Requests scheduled', value: String(stats.requestsScheduled) },
  ];
  const reviewHealth = Math.min(
    100,
    Math.round(
      (stats.avgRating ? stats.avgRating * 15 : 0) +
        Math.min(stats.published, 20) * 1.2 +
        (stats.pending === 0 ? 20 : 8),
    ),
  );
  const nextAction =
    stats.pending > 0
      ? {
          title: `${stats.pending} review${stats.pending === 1 ? '' : 's'} need a decision`,
          body: 'Approve good reviews, reject spam, and refresh rating schema from the moderation queue.',
          to: '/app/moderation',
          cta: 'Open moderation',
        }
      : {
          title: 'Keep fresh proof coming in',
          body: 'Tune review collection, widget style, and AI theme summaries from Settings.',
          to: '/app/settings',
          cta: 'Open settings',
        };

  return (
    <Page title="Klyna Reviews" subtitle={`Connected to ${shop}`}>
      <Layout>
        <Layout.Section>
          <div className="KlynaDashboardLead">
            <div className="KlynaDashboardLead__copy">
              <InlineStack align="space-between" blockAlign="center" gap="300">
                <InlineStack gap="200" blockAlign="center">
                  <p className="KlynaEyebrow">Trust engine</p>
                  <Badge tone={planHandle === 'growth' ? 'success' : 'info'}>
                    {planHandle === 'growth' ? 'Growth' : 'Free'}
                  </Badge>
                  {aiEnabled && <Badge tone="success">{`AI · ${aiProvider}`}</Badge>}
                </InlineStack>
                {planHandle === 'free' && (
                  <Button url={pricingUrl} target="_top">
                    View plans
                  </Button>
                )}
              </InlineStack>
              <h2 className="KlynaLeadTitle">Turn customer proof into a ranking asset.</h2>
              <p className="KlynaLeadBody">
                Collect star and photo reviews, moderate submissions, and publish AggregateRating
                schema so Google can understand your product ratings. Keep the workflow launch-safe
                today, then unlock AI summaries and richer collection when the store is ready.
              </p>
              <div className="KlynaSignalRow" aria-label="Review workload summary">
                <span>
                  <strong>{stats.pending}</strong> pending
                </span>
                <span>
                  <strong>{stats.published}</strong> published
                </span>
                <span>
                  <strong>{stats.requestsScheduled}</strong> scheduled
                </span>
              </div>
              <div className="KlynaActions">
                <Button url={embeddedRoute(nextAction.to)} variant="primary">
                  {nextAction.cta}
                </Button>
                <Button url={embeddedRoute('/app/analytics')}>View analytics</Button>
              </div>
            </div>
            <div className="KlynaHealthPanel">
              <div className="KlynaScore">
                <span className="KlynaScore__label">Trust readiness</span>
                <span className="KlynaScore__value">
                  <strong>{reviewHealth}</strong>
                  <span className="KlynaScore__total">/ 100</span>
                </span>
                <span className="KlynaScore__track">
                  <span className="KlynaScore__fill" style={{ width: `${reviewHealth}%` }} />
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

        <Layout.Section>
          <Card padding="0">
            <div className="KlynaMetricStrip">
              {metrics.map((m) => (
                <div className="KlynaMetric" key={m.label}>
                  <span className="KlynaMetric__label">{m.label}</span>
                  <strong className="KlynaMetric__value">{m.value}</strong>
                </div>
              ))}
            </div>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <div className="KlynaSectionHeader">
            <div>
              <h2>Review operations</h2>
              <p>Moderate, request, analyze, and turn customer language into product proof.</p>
            </div>
          </div>
          <div className="KlynaToolGrid">
            {tiles.map((t) => (
              <Link className="KlynaShortcut" key={t.to + t.title} to={embeddedRoute(t.to)}>
                <InlineStack align="space-between" blockAlign="center">
                  <InlineStack gap="200" blockAlign="center">
                    <Text as="h3" variant="headingSm">
                      {t.title}
                    </Text>
                    {t.ai && <Badge tone={aiEnabled ? 'success' : 'info'}>AI</Badge>}
                  </InlineStack>
                  {t.badge && <Badge tone="attention">{t.badge}</Badge>}
                </InlineStack>
                <small>{t.body}</small>
              </Link>
            ))}
          </div>
        </Layout.Section>

        {recent.length > 0 && (
          <Layout.Section>
            <Card padding="0">
              <BlockStack gap="300">
                <Box padding="400" paddingBlockEnd="0">
                  <div className="KlynaSectionHeader">
                    <div>
                      <h2>Latest review evidence</h2>
                      <p>Recent customer language, moderation status, and product context.</p>
                    </div>
                  </div>
                </Box>
                <Box padding="400">
                  <BlockStack gap="200">
                    {recent.map((r) => (
                      <div
                        key={r.id}
                        className="KlynaFinding"
                        data-severity={findingSeverity(r.status)}
                      >
                        <BlockStack gap="100">
                          <InlineStack align="space-between" blockAlign="center">
                            <InlineStack gap="200" blockAlign="center">
                              <Text as="span" fontWeight="bold">
                                {'★'.repeat(r.rating)}
                                {'☆'.repeat(5 - r.rating)}
                              </Text>
                              <Text as="span" variant="bodySm" tone="subdued">
                                {r.authorName}
                              </Text>
                              {r.verified && (
                                <Badge tone="success" size="small">
                                  Verified
                                </Badge>
                              )}
                            </InlineStack>
                            <Badge tone={statusTone(r.status)} size="small">
                              {r.status}
                            </Badge>
                          </InlineStack>
                          <Text as="p" variant="bodyMd">
                            {r.title ? <strong>{r.title} — </strong> : null}
                            {r.body}
                          </Text>
                          <Text as="p" variant="bodySm" tone="subdued">
                            {r.productTitle} · {new Date(r.createdAt).toLocaleDateString()}
                          </Text>
                        </BlockStack>
                      </div>
                    ))}
                  </BlockStack>
                </Box>
              </BlockStack>
            </Card>
          </Layout.Section>
        )}
      </Layout>
    </Page>
  );
}
