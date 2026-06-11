import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/node';
import { useLoaderData, useNavigation, useSubmit } from '@remix-run/react';
import {
  Badge,
  BlockStack,
  Banner,
  Button,
  Card,
  EmptyState,
  InlineStack,
  Layout,
  Page,
  Text,
  Thumbnail,
} from '@shopify/polaris';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';
import { fetchRecentOrderBaskets } from '../lib/admin.server';
import { mineFbt, type ProductMeta } from '../lib/fbt';

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

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  // Pull recent orders, mine pairs, persist.
  const { baskets, products } = await fetchRecentOrderBaskets(admin, 250);
  if (baskets.length === 0) {
    return json({ ok: false, error: 'No orders found to analyze yet.' }, { status: 200 });
  }

  const meta = new Map<string, ProductMeta>();
  for (const [gid, p] of products) {
    meta.set(gid, { title: p.title, imageUrl: p.imageUrl, price: p.price });
  }

  const recommendations = mineFbt(baskets, meta, { minSupport: 2, perAnchor: 4 });

  await prisma.fbtPair.deleteMany({ where: { shop } });
  if (recommendations.length > 0) {
    await prisma.fbtPair.createMany({
      data: recommendations.map((r) => ({
        shop,
        anchorGid: r.anchorGid,
        anchorTitle: r.anchorTitle,
        recommendedGid: r.recommendedGid,
        recommendedTitle: r.recommendedTitle,
        recommendedImage: r.recommendedImage,
        recommendedPrice: r.recommendedPrice,
        support: r.support,
        confidence: r.confidence,
      })),
    });
  }

  return json({
    ok: true,
    analyzed: baskets.length,
    found: recommendations.length,
  });
};

export default function Fbt() {
  const { groups, lastComputed, pairCount } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const nav = useNavigation();
  const computing = nav.state === 'submitting';

  const recompute = () => submit(new FormData(), { method: 'post' });

  return (
    <Page
      title="Frequently bought together"
      backAction={{ url: '/app' }}
      subtitle="Mined from your real order history — no external data."
      primaryAction={{ content: 'Recompute from orders', loading: computing, onAction: recompute }}
    >
      <Layout>
        <Layout.Section>
          <Banner tone="info">
            Klyna scans up to 250 recent orders and counts which products are bought
            together. Pairs seen in at least 2 orders become recommendations that the
            storefront block shows on the product page.
          </Banner>
        </Layout.Section>

        {pairCount === 0 ? (
          <Layout.Section>
            <Card>
              <EmptyState
                heading="No recommendations yet"
                action={{ content: 'Recompute from orders', onAction: recompute, loading: computing }}
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>
                  Run the analysis to mine frequently-bought-together pairs from your
                  order history. You need a handful of multi-item orders for pairs to surface.
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
