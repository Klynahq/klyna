import { type LoaderFunctionArgs } from '@remix-run/node';
import { Link, useLoaderData } from '@remix-run/react';
import {
  Badge,
  BlockStack,
  Box,
  Card,
  InlineGrid,
  InlineStack,
  Layout,
  Page,
  Text,
} from '@shopify/polaris';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  // Headline metrics, computed live from the wishlist tables.
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [wishlists, savedItems, savesLast30, sharesLast30, topRows] = await Promise.all([
    prisma.wishlist.count({ where: { shop } }),
    prisma.wishlistItem.count({ where: { shop } }),
    prisma.wishlistEvent.count({ where: { shop, type: 'add', createdAt: { gte: since } } }),
    prisma.wishlistEvent.count({ where: { shop, type: 'share', createdAt: { gte: since } } }),
    prisma.wishlistItem.groupBy({
      by: ['productId'],
      where: { shop },
      _count: { productId: true },
      orderBy: { _count: { productId: 'desc' } },
      take: 5,
    }),
  ]);

  const topSnapshots = topRows.length
    ? await prisma.wishlistItem.findMany({
        where: { shop, productId: { in: topRows.map((r) => r.productId) } },
        distinct: ['productId'],
      })
    : [];
  const titleById = new Map(topSnapshots.map((s) => [s.productId, s.productTitle]));
  const top = topRows.map((r) => ({
    productId: r.productId,
    saves: r._count.productId,
    title: titleById.get(r.productId) || r.productId,
  }));

  return { shop, wishlists, savedItems, savesLast30, sharesLast30, top };
};

export default function Dashboard() {
  const { shop, wishlists, savedItems, savesLast30, sharesLast30, top } =
    useLoaderData<typeof loader>();

  const stats = [
    { label: 'Wishlists', value: wishlists, hint: 'shoppers with at least one save' },
    { label: 'Items saved', value: savedItems, hint: 'across all wishlists' },
    { label: 'Saves · 30d', value: savesLast30, hint: 'add events this month' },
    { label: 'Shares · 30d', value: sharesLast30, hint: 'list links opened this month' },
  ];

  const tiles = [
    {
      title: 'Wishlists',
      body: 'Browse every shopper wishlist — guest and logged-in — and the products on each list.',
      to: '/app/lists',
    },
    {
      title: 'Most wishlisted',
      body: 'See which products shoppers save most. Spot demand before it shows up in orders.',
      to: '/app/reports',
    },
    {
      title: 'Settings',
      body: 'Turn on the storefront widget, tune the heart button, and copy your install snippet.',
      to: '/app/settings',
    },
  ];

  return (
    <Page title="Klyna Wishlist" subtitle={`Connected to ${shop}`}>
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">Turn saves into sales.</Text>
              <Text as="p" variant="bodyMd" tone="subdued">
                Klyna Wishlist lets shoppers save products they love — logged in or as
                guests — then re-engages them with shareable lists and most-wishlisted
                insight. Add the storefront widget from Settings to start collecting saves.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <InlineGrid columns={{ xs: 2, md: 4 }} gap="300">
            {stats.map((s) => (
              <Card key={s.label}>
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">{s.label}</Text>
                  <Text as="p" variant="heading2xl" fontWeight="bold">
                    {s.value.toLocaleString()}
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">{s.hint}</Text>
                </BlockStack>
              </Card>
            ))}
          </InlineGrid>
        </Layout.Section>

        {top.length > 0 && (
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">Top saved this month</Text>
                  <Link to="/app/reports">View full report →</Link>
                </InlineStack>
                <BlockStack gap="200">
                  {top.map((t, i) => (
                    <Box key={t.productId} paddingBlock="100">
                      <InlineStack align="space-between" blockAlign="center">
                        <InlineStack gap="200" blockAlign="center">
                          <Badge tone={i === 0 ? 'success' : undefined}>{`#${i + 1}`}</Badge>
                          <Text as="span" variant="bodyMd">{t.title}</Text>
                        </InlineStack>
                        <Text as="span" variant="bodyMd" fontWeight="semibold">
                          {`${t.saves.toLocaleString()} saves`}
                        </Text>
                      </InlineStack>
                    </Box>
                  ))}
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        )}

        <Layout.Section>
          <InlineGrid columns={{ xs: 1, md: 3 }} gap="300">
            {tiles.map((t) => (
              <Card key={t.to}>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingSm">{t.title}</Text>
                  <Text as="p" variant="bodyMd" tone="subdued">{t.body}</Text>
                  <Link to={t.to}>Open →</Link>
                </BlockStack>
              </Card>
            ))}
          </InlineGrid>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
