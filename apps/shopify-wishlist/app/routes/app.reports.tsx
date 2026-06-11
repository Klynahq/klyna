import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/node';
import { Form, useActionData, useLoaderData, useNavigation } from '@remix-run/react';
import {
  BlockStack,
  Box,
  Button,
  Card,
  EmptyState,
  IndexTable,
  InlineStack,
  Layout,
  Page,
  Text,
  Thumbnail,
  useIndexResourceState,
} from '@shopify/polaris';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';
import { mostWishlisted, resolveProducts } from '../wishlist.server';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [ranked, addEvents, removeEvents, cartEvents] = await Promise.all([
    mostWishlisted(shop, 25),
    prisma.wishlistEvent.count({ where: { shop, type: 'add', createdAt: { gte: since } } }),
    prisma.wishlistEvent.count({ where: { shop, type: 'remove', createdAt: { gte: since } } }),
    prisma.wishlistEvent.count({ where: { shop, type: 'add_to_cart', createdAt: { gte: since } } }),
  ]);

  // Wishlist-to-cart conversion over the trailing 30 days.
  const conversion = addEvents > 0 ? Math.round((cartEvents / addEvents) * 100) : 0;

  return { shop, ranked, addEvents, removeEvents, cartEvents, conversion };
};

// Re-hydrate the denormalized product snapshots from the live Admin API so the
// report reflects current titles, images, and prices.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  const productIds = (
    await prisma.wishlistItem.findMany({
      where: { shop },
      distinct: ['productId'],
      select: { productId: true },
    })
  ).map((r) => r.productId);

  if (productIds.length === 0) {
    return json({ refreshed: 0 });
  }

  const resolved = await resolveProducts(admin.graphql, productIds);
  let refreshed = 0;
  for (const [productId, p] of resolved) {
    const { count } = await prisma.wishlistItem.updateMany({
      where: { shop, productId },
      data: {
        productTitle: p.title,
        productHandle: p.handle,
        imageUrl: p.imageUrl,
        price: p.price,
        currency: p.currency,
      },
    });
    refreshed += count;
  }

  return json({ refreshed });
};

export default function Reports() {
  const { ranked, addEvents, removeEvents, cartEvents, conversion } =
    useLoaderData<typeof loader>();
  const data = useActionData<typeof action>();
  const nav = useNavigation();
  const refreshing = nav.state === 'submitting';

  const resourceName = { singular: 'product', plural: 'products' };
  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(
      ranked.map((r) => ({ ...r, id: r.productId })),
    );

  const stats = [
    { label: 'Saves · 30d', value: addEvents },
    { label: 'Removes · 30d', value: removeEvents },
    { label: 'Added to cart · 30d', value: cartEvents },
    { label: 'Save → cart', value: `${conversion}%` },
  ];

  return (
    <Page
      title="Most wishlisted"
      subtitle="Which products shoppers save most"
      backAction={{ url: '/app' }}
      primaryAction={
        <Form method="post">
          <Button submit loading={refreshing} variant="primary">
            Refresh product data
          </Button>
        </Form>
      }
    >
      <Layout>
        <Layout.Section>
          <InlineStack gap="300" wrap>
            {stats.map((s) => (
              <Box key={s.label} minWidth="180px">
                <Card>
                  <BlockStack gap="100">
                    <Text as="p" variant="bodySm" tone="subdued">{s.label}</Text>
                    <Text as="p" variant="headingXl" fontWeight="bold">
                      {typeof s.value === 'number' ? s.value.toLocaleString() : s.value}
                    </Text>
                  </BlockStack>
                </Card>
              </Box>
            ))}
          </InlineStack>
        </Layout.Section>

        {data && 'refreshed' in data && (
          <Layout.Section>
            <Card>
              <Text as="p" tone="success">
                {`Refreshed ${data.refreshed} saved item${data.refreshed === 1 ? '' : 's'} from the live catalog.`}
              </Text>
            </Card>
          </Layout.Section>
        )}

        <Layout.Section>
          {ranked.length === 0 ? (
            <Card>
              <EmptyState
                heading="No saves yet"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>
                  When shoppers start saving products, the most-wishlisted ranking
                  builds here automatically.
                </p>
              </EmptyState>
            </Card>
          ) : (
            <Card padding="0">
              <IndexTable
                resourceName={resourceName}
                itemCount={ranked.length}
                selectedItemsCount={
                  allResourcesSelected ? 'All' : selectedResources.length
                }
                onSelectionChange={handleSelectionChange}
                headings={[
                  { title: 'Rank' },
                  { title: 'Product' },
                  { title: 'Price' },
                  { title: 'Saves', alignment: 'end' },
                ]}
              >
                {ranked.map((r, index) => (
                  <IndexTable.Row
                    id={r.productId}
                    key={r.productId}
                    position={index}
                    selected={selectedResources.includes(r.productId)}
                  >
                    <IndexTable.Cell>
                      <Text as="span" variant="bodyMd" fontWeight="semibold">
                        {`#${index + 1}`}
                      </Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <InlineStack gap="300" blockAlign="center">
                        <Thumbnail
                          source={
                            r.imageUrl ??
                            'https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png'
                          }
                          alt={r.title}
                          size="small"
                        />
                        <Text as="span" variant="bodyMd">{r.title}</Text>
                      </InlineStack>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      {r.price ? (
                        <Text as="span" variant="bodyMd">
                          {`${r.price} ${r.currency ?? ''}`.trim()}
                        </Text>
                      ) : (
                        <Text as="span" variant="bodyMd" tone="subdued">—</Text>
                      )}
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Text as="span" variant="bodyMd" fontWeight="semibold" alignment="end">
                        {r.saves.toLocaleString()}
                      </Text>
                    </IndexTable.Cell>
                  </IndexTable.Row>
                ))}
              </IndexTable>
            </Card>
          )}
        </Layout.Section>
      </Layout>
    </Page>
  );
}
