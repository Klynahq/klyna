import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/node';
import { useFetcher, useLoaderData } from '@remix-run/react';
import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  EmptyState,
  InlineStack,
  Layout,
  Link as PolarisLink,
  Page,
  Text,
  Thumbnail,
} from '@shopify/polaris';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';
import { recordEvent } from '../wishlist.server';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const wishlists = await prisma.wishlist.findMany({
    where: { shop },
    orderBy: { updatedAt: 'desc' },
    take: 50,
    include: { items: { orderBy: { createdAt: 'desc' } } },
  });

  // The merchant-facing storefront base used to preview a shareable link.
  const shareBase = `https://${shop}/apps/wishlist`;

  return { shop, shareBase, wishlists };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();
  const intent = String(form.get('intent') ?? '');
  const id = String(form.get('id') ?? '');

  const wishlist = await prisma.wishlist.findFirst({ where: { id, shop } });
  if (!wishlist) {
    return json({ error: 'Wishlist not found' }, { status: 404 });
  }

  if (intent === 'toggle-public') {
    const updated = await prisma.wishlist.update({
      where: { id },
      data: { isPublic: !wishlist.isPublic },
    });
    if (updated.isPublic) {
      await recordEvent({ shop, type: 'share', wishlistId: id });
    }
    return json({ ok: true, isPublic: updated.isPublic });
  }

  if (intent === 'delete') {
    await prisma.wishlist.delete({ where: { id } });
    return json({ ok: true, deleted: true });
  }

  return json({ error: 'Unknown intent' }, { status: 400 });
};

export default function Lists() {
  const { shareBase, wishlists } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const busy = fetcher.state !== 'idle';

  if (wishlists.length === 0) {
    return (
      <Page title="Wishlists" backAction={{ url: '/app' }}>
        <Layout>
          <Layout.Section>
            <Card>
              <EmptyState
                heading="No wishlists yet"
                action={{ content: 'Set up the storefront widget', url: '/app/settings' }}
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>
                  Once shoppers start saving products with the wishlist button, their
                  lists show up here — guest and logged-in alike.
                </p>
              </EmptyState>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  return (
    <Page
      title="Wishlists"
      subtitle={`${wishlists.length} list${wishlists.length === 1 ? '' : 's'}`}
      backAction={{ url: '/app' }}
    >
      <Layout>
        {wishlists.map((w) => {
          const shareUrl = `${shareBase}?list=${w.token}`;
          return (
            <Layout.Section key={w.id}>
              <Card>
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <InlineStack gap="200" blockAlign="center">
                      <Text as="h2" variant="headingMd">{w.name}</Text>
                      <Badge tone={w.customerId ? 'success' : undefined}>
                        {w.customerId ? 'Customer' : 'Guest'}
                      </Badge>
                      {w.isPublic && <Badge tone="info">Shared</Badge>}
                    </InlineStack>
                    <Text as="span" variant="bodySm" tone="subdued">
                      {`${w.items.length} item${w.items.length === 1 ? '' : 's'}`}
                    </Text>
                  </InlineStack>

                  {w.items.length > 0 && (
                    <InlineStack gap="300" wrap>
                      {w.items.slice(0, 8).map((item) => (
                        <Box key={item.id} width="120px">
                          <BlockStack gap="100" inlineAlign="center">
                            <Thumbnail
                              source={
                                item.imageUrl ??
                                'https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png'
                              }
                              alt={item.productTitle}
                              size="large"
                            />
                            <Text as="span" variant="bodySm" alignment="center">
                              {item.productTitle || item.productId}
                            </Text>
                            {item.price && (
                              <Text as="span" variant="bodySm" tone="subdued">
                                {`${item.price} ${item.currency ?? ''}`.trim()}
                              </Text>
                            )}
                          </BlockStack>
                        </Box>
                      ))}
                    </InlineStack>
                  )}

                  <InlineStack gap="200" blockAlign="center">
                    <fetcher.Form method="post">
                      <input type="hidden" name="id" value={w.id} />
                      <input type="hidden" name="intent" value="toggle-public" />
                      <Button submit loading={busy} variant="tertiary">
                        {w.isPublic ? 'Make private' : 'Enable share link'}
                      </Button>
                    </fetcher.Form>
                    {w.isPublic && (
                      <PolarisLink url={shareUrl} target="_blank">
                        Open shared list
                      </PolarisLink>
                    )}
                    <fetcher.Form method="post">
                      <input type="hidden" name="id" value={w.id} />
                      <input type="hidden" name="intent" value="delete" />
                      <Button submit loading={busy} variant="tertiary" tone="critical">
                        Delete
                      </Button>
                    </fetcher.Form>
                  </InlineStack>

                  {w.isPublic && (
                    <Box
                      background="bg-surface-secondary"
                      padding="200"
                      borderRadius="200"
                    >
                      <Text as="span" variant="bodySm" tone="subdued" breakWord>
                        {shareUrl}
                      </Text>
                    </Box>
                  )}
                </BlockStack>
              </Card>
            </Layout.Section>
          );
        })}
      </Layout>
    </Page>
  );
}
