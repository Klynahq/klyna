import { type LoaderFunctionArgs } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import {
  BlockStack,
  Box,
  Card,
  DataTable,
  InlineGrid,
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

  const popups = await prisma.popup.findMany({
    where: { shop },
    select: { id: true, name: true, status: true },
  });

  const [impressionGroups, conversionGroups, dismissGroups] = await Promise.all([
    prisma.popupEvent.groupBy({
      by: ['popupId'],
      where: { shop, type: 'impression' },
      _count: { _all: true },
    }),
    prisma.popupEvent.groupBy({
      by: ['popupId'],
      where: { shop, type: 'conversion' },
      _count: { _all: true },
    }),
    prisma.popupEvent.groupBy({
      by: ['popupId'],
      where: { shop, type: 'dismiss' },
      _count: { _all: true },
    }),
  ]);

  const by = (groups: Array<{ popupId: string; _count: { _all: number } }>) =>
    Object.fromEntries(groups.map((g) => [g.popupId, g._count._all]));

  const impressionsBy = by(impressionGroups);
  const conversionsBy = by(conversionGroups);
  const dismissBy = by(dismissGroups);

  const rows = popups.map((p) => {
    const impressions = impressionsBy[p.id] ?? 0;
    const conversions = conversionsBy[p.id] ?? 0;
    const dismisses = dismissBy[p.id] ?? 0;
    return {
      name: p.name,
      status: p.status,
      impressions,
      conversions,
      dismisses,
      rate: conversionRate(conversions, impressions),
    };
  });

  const totals = rows.reduce(
    (acc, r) => ({
      impressions: acc.impressions + r.impressions,
      conversions: acc.conversions + r.conversions,
      dismisses: acc.dismisses + r.dismisses,
    }),
    { impressions: 0, conversions: 0, dismisses: 0 },
  );

  return {
    rows,
    totals: {
      ...totals,
      rate: conversionRate(totals.conversions, totals.impressions),
    },
  };
};

export default function Analytics() {
  const { rows, totals } = useLoaderData<typeof loader>();

  const cards = [
    { label: 'Impressions', value: totals.impressions.toLocaleString() },
    { label: 'Conversions', value: totals.conversions.toLocaleString() },
    { label: 'Dismissals', value: totals.dismisses.toLocaleString() },
    { label: 'Conversion rate', value: `${totals.rate}%` },
  ];

  return (
    <Page title="Analytics" subtitle="All-time popup performance">
      <Layout>
        <Layout.Section>
          <InlineGrid columns={{ xs: 2, md: 4 }} gap="300">
            {cards.map((c) => (
              <Card key={c.label}>
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">{c.label}</Text>
                  <Text as="p" variant="headingLg" fontWeight="bold">{c.value}</Text>
                </BlockStack>
              </Card>
            ))}
          </InlineGrid>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">By campaign</Text>
              {rows.length === 0 ? (
                <Box padding="200">
                  <Text as="p" tone="subdued">
                    No data yet. Activate a popup and enable the app embed on your
                    storefront to start collecting impressions and conversions.
                  </Text>
                </Box>
              ) : (
                <DataTable
                  columnContentTypes={['text', 'text', 'numeric', 'numeric', 'numeric', 'numeric']}
                  headings={['Campaign', 'Status', 'Impressions', 'Conversions', 'Dismissals', 'Rate']}
                  rows={rows.map((r) => [
                    r.name,
                    r.status,
                    r.impressions.toLocaleString(),
                    r.conversions.toLocaleString(),
                    r.dismisses.toLocaleString(),
                    `${r.rate}%`,
                  ])}
                />
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
