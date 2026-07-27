import { type LoaderFunctionArgs } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import {
  Badge,
  BlockStack,
  Banner,
  Card,
  EmptyState,
  InlineStack,
  Layout,
  Page,
  Text,
  Thumbnail,
} from '@shopify/polaris';
import prisma from '../db.server';
import { useEmbeddedRoute } from '../lib/embedded-routes';
import { authenticate } from '../shopify.server';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const pairs = await prisma.fbtPair.findMany({
    where: { shop },
    orderBy: [{ support: 'desc' }, { confidence: 'desc' }],
    take: 100,
  });

  // Group by anchor for a readable layout.
  const grouped = new Map<string, { anchorGid: string; anchorTitle: string; recs: typeof pairs }>();
  for (const p of pairs) {
    const g = grouped.get(p.anchorGid) ?? {
      anchorGid: p.anchorGid,
      anchorTitle: p.anchorTitle,
      recs: [] as typeof pairs,
    };
    g.recs.push(p);
    grouped.set(p.anchorGid, g);
  }

  const lastComputed = pairs[0]?.computedAt ?? null;
  return { groups: [...grouped.values()], lastComputed, pairCount: pairs.length };
};

export default function Fbt() {
  const { groups, lastComputed, pairCount } = useLoaderData<typeof loader>();
  const embeddedRoute = useEmbeddedRoute();

  return (
    <Page
      title="Frequently bought together"
      backAction={{ url: embeddedRoute('/app') }}
      subtitle="Optional order-history recommendations."
    >
      <Layout>
        <Layout.Section>
          <Banner tone="warning" title="Order-history recommendations are not enabled">
            This feature needs Shopify protected customer data approval because it
            analyzes orders. Bundles and volume discounts work without that approval.
          </Banner>
        </Layout.Section>

        {pairCount === 0 ? (
          <Layout.Section>
            <Card>
              <EmptyState
                heading="No recommendations yet"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>
                  Re-enable order access after protected data approval to mine
                  frequently-bought-together pairs from real orders.
                </p>
              </EmptyState>
            </Card>
          </Layout.Section>
        ) : (
          <>
            <Layout.Section>
              <Text as="p" variant="bodySm" tone="subdued">
                {pairCount} recommendations · last computed{' '}
                {lastComputed ? new Date(lastComputed).toLocaleString() : '—'}
              </Text>
            </Layout.Section>
            {groups.map((g) => (
              <Layout.Section key={g.anchorGid}>
                <Card>
                  <BlockStack gap="300">
                    <Text as="h3" variant="headingSm">
                      Customers who bought <b>{g.anchorTitle}</b> also bought
                    </Text>
                    <BlockStack gap="200">
                      {g.recs.map((r) => (
                        <InlineStack key={r.id} align="space-between" blockAlign="center" wrap={false}>
                          <InlineStack gap="300" blockAlign="center">
                            <Thumbnail
                              source={r.recommendedImage ?? 'https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png'}
                              alt={r.recommendedTitle}
                              size="small"
                            />
                            <BlockStack gap="0">
                              <Text as="span" variant="bodyMd">{r.recommendedTitle}</Text>
                              <Text as="span" variant="bodySm" tone="subdued">{r.recommendedPrice.toFixed(2)}</Text>
                            </BlockStack>
                          </InlineStack>
                          <InlineStack gap="200" blockAlign="center">
                            <Badge>{`${r.support} orders`}</Badge>
                            <Badge tone="success">{`${Math.round(r.confidence * 100)}% confidence`}</Badge>
                          </InlineStack>
                        </InlineStack>
                      ))}
                    </BlockStack>
                  </BlockStack>
                </Card>
              </Layout.Section>
            ))}
          </>
        )}
      </Layout>
    </Page>
  );
}
