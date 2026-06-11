import { type LoaderFunctionArgs, json } from '@remix-run/node';
import { useLoaderData, useSearchParams } from '@remix-run/react';
import {
  BlockStack,
  Box,
  ButtonGroup,
  Button,
  Card,
  EmptyState,
  InlineGrid,
  InlineStack,
  Layout,
  Page,
  Text,
} from '@shopify/polaris';
import { authenticate } from '../shopify.server';
import { getSummary } from '../models/analytics.server';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const days = clampDays(Number.parseInt(url.searchParams.get('days') ?? '30', 10));

  const summary = await getSummary(session.shop, days);

  // Resolve the top product GIDs to human titles for the leaderboard.
  let titles: Record<string, string> = {};
  const ids = summary.topProducts.map((p) => p.productId).filter(Boolean);
  if (ids.length) {
    try {
      const res = await admin.graphql(
        `#graphql
        query StickyCartTopProducts($ids: [ID!]!) {
          nodes(ids: $ids) {
            ... on Product { id title }
          }
        }`,
        { variables: { ids: ids.map(toGid) } },
      );
      const body = (await res.json()) as {
        data?: { nodes?: ({ id: string; title: string } | null)[] };
      };
      for (const n of body.data?.nodes ?? []) {
        if (n?.id) titles[fromGid(n.id)] = n.title;
      }
    } catch {
      titles = {};
    }
  }

  return json({ days, summary, titles });
};

function clampDays(d: number): number {
  if (![7, 30, 90].includes(d)) return 30;
  return d;
}

function toGid(id: string): string {
  return id.startsWith('gid://') ? id : `gid://shopify/Product/${id}`;
}
function fromGid(gid: string): string {
  const parts = gid.split('/');
  return parts[parts.length - 1] ?? gid;
}

export default function Analytics() {
  const { days, summary, titles } = useLoaderData<typeof loader>();
  const [params, setParams] = useSearchParams();

  const num = new Intl.NumberFormat();
  const setDays = (d: number) => {
    params.set('days', String(d));
    setParams(params);
  };

  const hasData = summary.totals.impression > 0 || summary.totals.atc > 0;

  const cards = [
    { label: 'Impressions', value: num.format(summary.totals.impression) },
    { label: 'Add-to-cart clicks', value: num.format(summary.totals.atc) },
    { label: 'Add-to-cart rate', value: `${summary.atcRate}%` },
    { label: 'Quick-buy clicks', value: num.format(summary.totals.quickbuy) },
    { label: 'Quick-buy rate', value: `${summary.quickBuyRate}%` },
    { label: 'Variant changes', value: num.format(summary.totals.variant) },
    { label: 'Quantity changes', value: num.format(summary.totals.qty) },
    { label: 'Free-shipping unlocks', value: num.format(summary.totals.freeship_unlock) },
  ];

  const maxDaily = Math.max(1, ...summary.daily.map((d) => d.impressions));

  return (
    <Page
      title="Analytics"
      subtitle="Sticky cart interactions from the storefront"
      backAction={{ url: '/app' }}
    >
      <Layout>
        <Layout.Section>
          <InlineStack align="space-between" blockAlign="center">
            <Text as="p" variant="bodySm" tone="subdued">
              Showing the last {days} days.
            </Text>
            <ButtonGroup variant="segmented">
              <Button pressed={days === 7} onClick={() => setDays(7)}>7d</Button>
              <Button pressed={days === 30} onClick={() => setDays(30)}>30d</Button>
              <Button pressed={days === 90} onClick={() => setDays(90)}>90d</Button>
            </ButtonGroup>
          </InlineStack>
        </Layout.Section>

        {!hasData ? (
          <Layout.Section>
            <Card>
              <EmptyState
                heading="No interactions yet"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>
                  Once the “Klyna Sticky Cart” app embed is active and shoppers reach a
                  product page, impressions and clicks will appear here.
                </p>
              </EmptyState>
            </Card>
          </Layout.Section>
        ) : (
          <>
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
                  <Text as="h2" variant="headingMd">Daily impressions</Text>
                  <Box paddingBlockStart="200">
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 120 }}>
                      {summary.daily.map((d) => {
                        const h = Math.max(2, Math.round((d.impressions / maxDaily) * 116));
                        return (
                          <div
                            key={d.date}
                            title={`${d.date}: ${d.impressions} impressions · ${d.atc} ATC`}
                            style={{
                              flex: 1,
                              height: h,
                              minWidth: 2,
                              borderRadius: 3,
                              background: 'var(--p-color-bg-fill-brand)',
                            }}
                          />
                        );
                      })}
                    </div>
                  </Box>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Hover a bar for the exact count. Add-to-cart events are tracked
                    alongside impressions.
                  </Text>
                </BlockStack>
              </Card>
            </Layout.Section>

            <Layout.Section>
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">Top products from the bar</Text>
                  {summary.topProducts.length === 0 ? (
                    <Text as="p" tone="subdued">
                      No product-level add-to-cart events yet.
                    </Text>
                  ) : (
                    <BlockStack gap="200">
                      {summary.topProducts.map((p) => (
                        <InlineStack key={p.productId} align="space-between" blockAlign="center">
                          <Text as="span" variant="bodyMd">
                            {titles[p.productId] ?? `Product ${p.productId}`}
                          </Text>
                          <Text as="span" variant="bodyMd" tone="subdued">
                            {num.format(p.atc)} ATC · {num.format(p.impressions)} views
                          </Text>
                        </InlineStack>
                      ))}
                    </BlockStack>
                  )}
                </BlockStack>
              </Card>
            </Layout.Section>
          </>
        )}
      </Layout>
    </Page>
  );
}
