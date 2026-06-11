// Klyna Wishlist — admin view for AI gift-guide blurbs.
//
// Lists shared wishlists, shows whether each has an AI gift-bundle blurb,
// and lets the merchant generate or regenerate one. The blurb is the same
// 40-word callout the recipient sees at the top of the shared list.

import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/node';
import { Form, useActionData, useLoaderData, useNavigation } from '@remix-run/react';
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
import { authenticate } from '../shopify.server';
import prisma from '../db.server';
import { ensureGiftBlurb } from '../lib/gift-blurb.server';
import { getShopAiSettings } from '../lib/ai.server';

type LoaderData = {
  aiOff: boolean;
  lists: {
    id: string;
    token: string;
    name: string;
    isPublic: boolean;
    itemCount: number;
    giftBlurb: string | null;
    updatedAt: string;
  }[];
  flash: { ok?: boolean; error?: string; wishlistId?: string } | null;
};

export const loader = async ({ request }: LoaderFunctionArgs): Promise<LoaderData> => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const settings = await getShopAiSettings(shop);

  const rows = await prisma.wishlist.findMany({
    where: { shop },
    orderBy: { updatedAt: 'desc' },
    take: 30,
    include: { _count: { select: { items: true } } },
  });

  return {
    aiOff: settings.provider === 'off',
    lists: rows.map((r) => ({
      id: r.id,
      token: r.token,
      name: r.name,
      isPublic: r.isPublic,
      itemCount: r._count.items,
      giftBlurb: r.giftBlurb,
      updatedAt: r.updatedAt.toISOString(),
    })),
    flash: null,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const wishlistId = String(form.get('wishlistId') ?? '');
  if (!wishlistId) {
    return json({ ok: false, error: 'Missing wishlist id.' });
  }
  const result = await ensureGiftBlurb(session.shop, wishlistId, { force: true });
  return json({ ok: result.ok, error: result.error, wishlistId });
};

export default function GiftGuide() {
  const { aiOff, lists } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const submitting = nav.state === 'submitting';
  const pendingId =
    nav.formData && nav.state === 'submitting'
      ? String(nav.formData.get('wishlistId') ?? '')
      : null;

  return (
    <Page title="Gift-guide blurbs" backAction={{ url: '/app' }}>
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">How this works</Text>
              <Text as="p" variant="bodyMd" tone="subdued">
                When a shopper shares their wishlist, Klyna asks the AI to pick the best
                two items as a bundle gift and write a short paragraph. The blurb is
                saved on the wishlist and shown at the top of the shared page. You can
                regenerate any blurb below if you want a different angle.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>

        {actionData && actionData.ok === false && actionData.error ? (
          <Layout.Section>
            <Banner tone="critical" title="Could not generate blurb">
              <Text as="p" variant="bodyMd">{actionData.error}</Text>
            </Banner>
          </Layout.Section>
        ) : null}
        {actionData && actionData.ok ? (
          <Layout.Section>
            <Banner tone="success" title="Blurb generated" />
          </Layout.Section>
        ) : null}

        {aiOff ? (
          <Layout.Section>
            <Banner tone="warning" title="AI is off">
              <Text as="p" variant="bodyMd">
                Add a free-tier provider key in Settings to start generating blurbs.
                Klyna does not ship a managed key. Sharing still works without AI; the
                blurb section is just hidden on the shared page.
              </Text>
            </Banner>
          </Layout.Section>
        ) : null}

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Recent wishlists</Text>
              {lists.length === 0 ? (
                <Text as="p" tone="subdued" variant="bodyMd">
                  No wishlists yet. Install the storefront widget so shoppers can save products.
                </Text>
              ) : (
                <BlockStack gap="300">
                  {lists.map((l) => {
                    const isPending = submitting && pendingId === l.id;
                    return (
                      <Box
                        key={l.id}
                        paddingBlock="200"
                        borderBlockStartWidth="025"
                        borderColor="border"
                      >
                        <BlockStack gap="200">
                          <InlineStack align="space-between" blockAlign="center" gap="200">
                            <InlineStack gap="200" blockAlign="center">
                              <Text as="span" variant="bodyMd" fontWeight="semibold">
                                {l.name}
                              </Text>
                              <Badge tone={l.isPublic ? 'success' : undefined}>
                                {l.isPublic ? 'Shared' : 'Private'}
                              </Badge>
                              <Text as="span" variant="bodySm" tone="subdued">
                                {`${l.itemCount} item${l.itemCount === 1 ? '' : 's'}`}
                              </Text>
                            </InlineStack>
                            <Form method="post">
                              <input type="hidden" name="wishlistId" value={l.id} />
                              <Button
                                submit
                                variant="secondary"
                                loading={isPending}
                                disabled={aiOff || l.itemCount < 2}
                              >
                                {l.giftBlurb ? 'Regenerate blurb' : 'Generate blurb'}
                              </Button>
                            </Form>
                          </InlineStack>
                          {l.giftBlurb ? (
                            <Box
                              padding="300"
                              borderRadius="200"
                              background="bg-surface-secondary"
                            >
                              <Text as="p" variant="bodyMd">
                                {l.giftBlurb}
                              </Text>
                            </Box>
                          ) : (
                            <Text as="p" variant="bodySm" tone="subdued">
                              {l.itemCount < 2
                                ? 'Needs at least two saved products before a blurb can be generated.'
                                : 'No blurb yet. The first share will generate one if AI is on.'}
                            </Text>
                          )}
                        </BlockStack>
                      </Box>
                    );
                  })}
                </BlockStack>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
