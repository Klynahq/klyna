import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/node';
import { useFetcher, useLoaderData, useRevalidator } from '@remix-run/react';
import { useCallback, useState } from 'react';
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  Divider,
  InlineStack,
  Layout,
  Page,
  ProgressBar,
  Spinner,
  Text,
  TextField,
  Thumbnail,
} from '@shopify/polaris';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';

type ImageRow = {
  imageId: string;
  productId: string;
  productTitle: string;
  imageUrl: string;
  currentAlt: string | null;
  suggested: string;
};

type ProductNode = {
  id: string;
  title: string;
  images: {
    nodes: { id: string; altText: string | null; url: string }[];
  };
};

function generateAlt(productTitle: string, position: number): string {
  const pos = position === 0 ? '' : ` — view ${position + 1}`;
  return `${productTitle}${pos}`.trim();
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;

  const allImages: ImageRow[] = [];
  let cursor: string | null = null;

  while (true) {
    const res = await admin.graphql(
      `query ($cursor: String) {
        products(first: 20, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes {
            id
            title
            images(first: 10) {
              nodes { id altText url }
            }
          }
        }
      }`,
      { variables: { cursor } },
    );
    const json = (await res.json()) as {
      data: { products: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: ProductNode[] } };
    };
    const { nodes, pageInfo } = json.data.products;

    for (const product of nodes) {
      product.images.nodes.forEach((img, idx) => {
        if (!img.altText || img.altText.trim() === '') {
          allImages.push({
            imageId: img.id,
            productId: product.id,
            productTitle: product.title,
            imageUrl: img.url,
            currentAlt: img.altText,
            suggested: generateAlt(product.title, idx),
          });
        }
      });
    }

    if (!pageInfo.hasNextPage || allImages.length >= 500) break;
    cursor = pageInfo.endCursor;
  }

  // Total image count (including ones with alt text)
  const fixedRes = await admin.graphql(`{ shop { id } }`);
  void fixedRes;

  return json({ shop, images: allImages });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();
  const intent = String(form.get('intent') ?? 'update-one');

  if (intent === 'update-one') {
    const productId = String(form.get('productId'));
    const imageId = String(form.get('imageId'));
    const altText = String(form.get('altText')).trim();

    const res = await admin.graphql(
      `mutation klynaAltText($productId: ID!, $image: ImageInput!) {
        productImageUpdate(productId: $productId, image: $image) {
          image { id altText }
          userErrors { field message }
        }
      }`,
      { variables: { productId, image: { id: imageId, altText } } },
    );
    const gqlJson = (await res.json()) as { data: { productImageUpdate: { userErrors: { message: string }[] } } };
    const errors = gqlJson.data.productImageUpdate.userErrors;
    if (errors.length > 0) {
      return json({ error: errors[0]?.message ?? 'Update failed' });
    }

    await prisma.fixLog.create({
      data: { shop, resourceId: productId, url: imageId, field: 'altText', newValue: altText },
    });

    return json({ updated: true, imageId });
  }

  if (intent === 'update-all') {
    const pairs = form.getAll('pair').map(String);
    const applied: string[] = [];

    await Promise.allSettled(
      pairs.map(async (pair) => {
        const [productId, imageId, ...rest] = pair.split('|');
        const altText = rest.join('|');
        if (!productId || !imageId || !altText) return;

        const res = await admin.graphql(
          `mutation klynaAltText($productId: ID!, $image: ImageInput!) {
            productImageUpdate(productId: $productId, image: $image) {
              image { id altText }
              userErrors { field message }
            }
          }`,
          { variables: { productId, image: { id: imageId, altText } } },
        );
        const gqlJson2 = (await res.json()) as { data: { productImageUpdate: { userErrors: { message: string }[] } } };
        if (gqlJson2.data.productImageUpdate.userErrors.length === 0) {
          applied.push(imageId);
          await prisma.fixLog.create({
            data: { shop, resourceId: productId ?? '', url: imageId, field: 'altText', newValue: altText },
          });
        }
      }),
    );

    return json({ updatedAll: true, count: applied.length });
  }

  return json({ error: 'Unknown intent' });
};

export default function AltTextPage() {
  const { images } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<{ updated?: boolean; updatedAll?: boolean; count?: number; imageId?: string; error?: string }>();
  const revalidator = useRevalidator();

  const [edits, setEdits] = useState<Record<string, string>>({});
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const [bulkRunning, setBulkRunning] = useState(false);

  const getAlt = (img: ImageRow) => edits[img.imageId] ?? img.suggested;

  const updateOne = useCallback(
    (img: ImageRow) => {
      const fd = new FormData();
      fd.set('intent', 'update-one');
      fd.set('productId', img.productId);
      fd.set('imageId', img.imageId);
      fd.set('altText', getAlt(img));
      fetcher.submit(fd, { method: 'post' });
    },
    [fetcher, edits],
  );

  const updateAll = useCallback(() => {
    setBulkRunning(true);
    const fd = new FormData();
    fd.set('intent', 'update-all');
    const pending = images.filter((img) => !applied.has(img.imageId));
    pending.forEach((img) => {
      fd.append('pair', `${img.productId}|${img.imageId}|${getAlt(img)}`);
    });
    fetcher.submit(fd, { method: 'post' });
  }, [fetcher, images, applied, edits]);

  // Track applied images
  if (fetcher.data?.updated && fetcher.data.imageId && !applied.has(fetcher.data.imageId)) {
    setApplied((prev) => new Set([...prev, fetcher.data!.imageId!]));
  }
  if (fetcher.data?.updatedAll) {
    setBulkRunning(false);
    void revalidator.revalidate();
  }

  const pending = images.filter((img) => !applied.has(img.imageId));
  const busy = fetcher.state === 'submitting';

  return (
    <Page title="Image Alt Text Manager" backAction={{ url: '/app' }}>
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingMd">Missing alt text</Text>
                  <Text as="p" tone="subdued">
                    Alt text is read by screen readers and used by Google to understand product images.
                    Klyna auto-generates descriptive alt text from your product names.
                  </Text>
                </BlockStack>
                <InlineStack gap="200" blockAlign="center">
                  <Badge tone={pending.length === 0 ? 'success' : 'critical'}>
                    {pending.length === 0 ? 'All images have alt text' : `${pending.length} missing`}
                  </Badge>
                  {pending.length > 0 && (
                    <Button
                      variant="primary"
                      onClick={updateAll}
                      loading={bulkRunning && busy}
                      disabled={busy}
                    >
                      {`Apply all (${pending.length})`}
                    </Button>
                  )}
                </InlineStack>
              </InlineStack>

              {fetcher.data?.updatedAll && (
                <Banner tone="success" title={`Applied alt text to ${fetcher.data.count} images`} />
              )}
              {fetcher.data?.error && (
                <Banner tone="critical" title={fetcher.data.error} />
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        {pending.length > 0 && (
          <Layout.Section>
            <Card>
              <BlockStack gap="0">
                {/* Header */}
                <Box padding="300" background="bg-surface-secondary">
                  <InlineStack align="space-between">
                    <Text as="p" variant="bodySm" fontWeight="semibold" tone="subdued">Product / Image</Text>
                    <Text as="p" variant="bodySm" fontWeight="semibold" tone="subdued">Alt text</Text>
                  </InlineStack>
                </Box>
                <Divider />

                {pending.map((img, i) => {
                  const isApplied = applied.has(img.imageId);
                  const isBusy =
                    busy &&
                    fetcher.formData?.get('imageId') === img.imageId &&
                    fetcher.formData?.get('intent') === 'update-one';

                  return (
                    <Box
                      key={img.imageId}
                      padding="300"
                      background={i % 2 === 0 ? 'bg-surface' : 'bg-surface-secondary'}
                    >
                      <InlineStack align="space-between" blockAlign="start" gap="400">
                        <InlineStack gap="300" blockAlign="start">
                          <Thumbnail
                            source={img.imageUrl}
                            alt={img.currentAlt ?? 'Product image'}
                            size="small"
                          />
                          <BlockStack gap="050">
                            <Text as="p" variant="bodyMd" fontWeight="semibold">
                              {img.productTitle}
                            </Text>
                            <Text as="p" variant="bodySm" tone="subdued">
                              {img.currentAlt ? `Current: "${img.currentAlt}"` : 'No alt text'}
                            </Text>
                          </BlockStack>
                        </InlineStack>

                        <Box minWidth="320px">
                          <InlineStack gap="200" blockAlign="center">
                            <Box width="100%">
                              <TextField
                                label=""
                                labelHidden
                                value={getAlt(img)}
                                onChange={(v) => setEdits((prev) => ({ ...prev, [img.imageId]: v }))}
                                autoComplete="off"
                                disabled={isApplied || isBusy}
                                connectedRight={
                                  <Button
                                    onClick={() => updateOne(img)}
                                    loading={isBusy}
                                    disabled={isApplied || busy}
                                    tone={isApplied ? 'success' : undefined}
                                    size="slim"
                                  >
                                    {isApplied ? '✓' : 'Apply'}
                                  </Button>
                                }
                              />
                            </Box>
                          </InlineStack>
                        </Box>
                      </InlineStack>
                    </Box>
                  );
                })}
              </BlockStack>
            </Card>
          </Layout.Section>
        )}

        {images.length === 0 && (
          <Layout.Section>
            <Banner tone="success" title="All product images have alt text">
              <Text as="p" variant="bodyMd">
                Great work — every product image in your store has descriptive alt text.
              </Text>
            </Banner>
          </Layout.Section>
        )}
      </Layout>
    </Page>
  );
}
