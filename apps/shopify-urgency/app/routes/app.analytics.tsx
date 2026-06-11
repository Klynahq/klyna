import { type LoaderFunctionArgs } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import {
  BlockStack,
  Card,
  DataTable,
  EmptyState,
  InlineGrid,
  Layout,
  Page,
  Text,
} from '@shopify/polaris';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';
import { ctr, dayKey, totalsForShop, type Totals } from '../lib/analytics.server';

type DailyRow = { day: string; views: number; clicks: number; conversions: number };

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const since = dayKey(new Date(Date.now() - 30 * 86_400_000));

  const [totals, byType, daily] = await Promise.all([
    totalsForShop(shop, 30),
    prisma.impression.groupBy({
      by: ['widgetType'],
      where: { shop, day: { gte: since } },
      _sum: { views: true, clicks: true, conversions: true },
    }),
    prisma.impression.findMany({
      where: { shop, day: { gte: since } },
      select: { day: true, views: true, clicks: true, conversions: true },
      orderBy: { day: 'desc' },
    }),
  ]);

  // Roll the per-widget daily rows up into one row per day.
  const dayMap = new Map<string, DailyRow>();
  for (const r of daily) {
    const cur = dayMap.get(r.day) ?? { day: r.day, views: 0, clicks: 0, conversions: 0 };
    cur.views += r.views;
    cur.clicks += r.clicks;
    cur.conversions += r.conversions;
    dayMap.set(r.day, cur);
  }
  const dailyRows = Array.from(dayMap.values()).sort((a, b) => (a.day < b.day ? 1 : -1)).slice(0, 30);

  const perType = byType.map((b) => ({
    widgetType: b.widgetType,
    views: b._sum.views ?? 0,
    clicks: b._sum.clicks ?? 0,
    conversions: b._sum.conversions ?? 0,
  }));

  return { shop, totals, perType, dailyRows };
};

const TYPE_LABEL: Record<string, string> = {
  timer: 'Countdown timers',
  scarcity: 'Stock scarcity',
  proof: 'Social proof',
};

export default function Analytics() {
  const { totals, perType, dailyRows } = useLoaderData<typeof loader>();

  const stats = [
    { label: 'Impressions (30d)', value: totals.views.toLocaleString() },
    { label: 'Clicks (30d)', value: totals.clicks.toLocaleString() },
    { label: 'CTR', value: `${ctr(totals)}%` },
    { label: 'Conversions (30d)', value: totals.conversions.toLocaleString() },
  ];

  const hasData = totals.views > 0 || totals.clicks > 0;

  const typeRows = perType.map((t) => {
    const tt: Totals = { views: t.views, clicks: t.clicks, conversions: t.conversions };
    return [
      TYPE_LABEL[t.widgetType] ?? t.widgetType,
      t.views.toLocaleString(),
      t.clicks.toLocaleString(),
      `${ctr(tt)}%`,
      t.conversions.toLocaleString(),
    ];
  });

  const dailyTableRows = dailyRows.map((d) => {
    const tt: Totals = { views: d.views, clicks: d.clicks, conversions: d.conversions };
    return [
      d.day,
      d.views.toLocaleString(),
      d.clicks.toLocaleString(),
      `${ctr(tt)}%`,
      d.conversions.toLocaleString(),
    ];
  });

  return (
    <Page title="Analytics" subtitle="Last 30 days" backAction={{ url: '/app' }}>
      <Layout>
        <Layout.Section>
          <InlineGrid columns={{ xs: 2, sm: 4 }} gap="300">
            {stats.map((s) => (
              <Card key={s.label}>
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">{s.label}</Text>
                  <Text as="p" variant="headingXl" fontWeight="bold">{s.value}</Text>
                </BlockStack>
              </Card>
            ))}
          </InlineGrid>
        </Layout.Section>

        {!hasData ? (
          <Layout.Section>
            <Card>
              <EmptyState
                heading="No impressions yet"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>Once your Klyna Urgency blocks are live on the storefront, views,
                  clicks, and conversions roll up here daily.</p>
              </EmptyState>
            </Card>
          </Layout.Section>
        ) : (
          <>
            <Layout.Section>
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">By widget</Text>
                  <DataTable
                    columnContentTypes={['text', 'numeric', 'numeric', 'numeric', 'numeric']}
                    headings={['Widget', 'Views', 'Clicks', 'CTR', 'Conversions']}
                    rows={typeRows}
                  />
                </BlockStack>
              </Card>
            </Layout.Section>

            <Layout.Section>
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">By day</Text>
                  <DataTable
                    columnContentTypes={['text', 'numeric', 'numeric', 'numeric', 'numeric']}
                    headings={['Day', 'Views', 'Clicks', 'CTR', 'Conversions']}
                    rows={dailyTableRows}
                  />
                </BlockStack>
              </Card>
            </Layout.Section>
          </>
        )}
      </Layout>
    </Page>
  );
}
