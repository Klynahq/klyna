import { type LoaderFunctionArgs, json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
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
  Text,
} from '@shopify/polaris';
import { authenticate } from '../shopify.server';

type ProductWithCollections = {
  id: string;
  handle: string;
  title: string;
  onlineStoreUrl: string | null;
  collections: { handle: string; title: string }[];
  canonicalUrl: string;
  duplicateUrls: string[];
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  type ShopRes = { data: { shop: { myshopifyDomain: string; primaryDomain: { url: string } } } };
  const shopRes = await admin.graphql('{ shop { myshopifyDomain primaryDomain { url } } }');
  const shopData = ((await shopRes.json()) as ShopRes).data.shop;
  const baseUrl = shopData.primaryDomain.url.replace(/\/$/, '');
  const myDomain = shopData.myshopifyDomain;

  // Fetch products with their collections
  type P = {
    id: string;
    handle: string;
    title: string;
    onlineStoreUrl: string | null;
    collections: { nodes: { handle: string; title: string }[] };
  };

  const productsWithCollections: ProductWithCollections[] = [];
  let cursor: string | null = null;

  while (productsWithCollections.length < 250) {
    const res = await admin.graphql(
      `query ($cursor: String) {
        products(first: 50, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes {
            id handle title onlineStoreUrl
            collections(first: 15) {
              nodes { handle title }
            }
          }
        }
      }`,
      { variables: { cursor } },
    );

    const gqlData = (await res.json()) as {
      data: {
        products: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: P[] };
      };
    };
    const { nodes, pageInfo } = gqlData.data.products;

    for (const p of nodes) {
      const canonical = p.onlineStoreUrl ?? `${baseUrl}/products/${p.handle}`;
      const colls = p.collections.nodes;
      const duplicates = colls.map(
        (c) => `${baseUrl}/collections/${c.handle}/products/${p.handle}`,
      );

      productsWithCollections.push({
        id: p.id,
        handle: p.handle,
        title: p.title,
        onlineStoreUrl: p.onlineStoreUrl,
        collections: colls,
        canonicalUrl: canonical,
        duplicateUrls: duplicates,
      });
    }

    if (!pageInfo.hasNextPage) break;
    cursor = pageInfo.endCursor;
  }

  const affected = productsWithCollections.filter((p) => p.collections.length > 1);
  const totalDuplicates = affected.reduce((sum, p) => sum + p.collections.length, 0);
  const safeProducts = productsWithCollections.filter((p) => p.collections.length <= 1);

  return json({
    affected,
    safeCount: safeProducts.length,
    totalProducts: productsWithCollections.length,
    totalDuplicates,
    baseUrl,
  });
};

const LIQUID_FIX = `{{- comment -}}
Klyna Canonical Fix — replace the collection-scoped URL with the canonical product URL.
Find this in your theme at: snippets/card-product.liquid (Dawn theme)
Look for: product.url | within: collection
Replace with: product.url
{{- endcomment -}}

{{- Before (causes duplicate URLs) -}}
<a href="{{ card_product.url | within: collection }}">

{{- After (canonical URL, no duplicates) -}}
<a href="{{ card_product.url }}">`;

export default function CanonicalPage() {
  const { affected, safeCount, totalProducts, totalDuplicates, baseUrl } =
    useLoaderData<typeof loader>();

  return (
    <Page title="Canonical URL Auditor" backAction={{ url: '/app' }}>
      <Layout>
        {/* Overview */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingMd">
                    Duplicate URL detector
                  </Text>
                  <Text as="p" tone="subdued">
                    Shopify creates a unique URL for every product (/products/handle) but also lets
                    them be accessed via collection paths (/collections/x/products/handle). Each
                    collection a product belongs to creates a new, indexable URL — even with
                    canonical tags, Google may ignore them and split link equity across duplicates.
                  </Text>
                </BlockStack>
                <InlineStack gap="200">
                  <Badge tone={affected.length === 0 ? 'success' : 'critical'}>
                    {`${affected.length} affected products`}
                  </Badge>
                  <Badge tone="info">{`${safeCount} clean`}</Badge>
                </InlineStack>
              </InlineStack>

              <Banner
                tone={
                  affected.length === 0 ? 'success' : affected.length > 20 ? 'critical' : 'warning'
                }
                title={
                  affected.length === 0
                    ? 'No canonical URL issues detected'
                    : `${affected.length} products with ${totalDuplicates} potential duplicate URLs`
                }
              >
                <Text as="p" variant="bodyMd">
                  {affected.length === 0
                    ? 'Every product belongs to at most one collection — no duplicate URL risk.'
                    : `Products in multiple collections can be accessed at ${totalDuplicates} different URLs. Google may see these as separate pages with thin, duplicate content. Fix: update your theme to always link to the canonical product URL instead of the collection-scoped path.`}
                </Text>
              </Banner>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* The fix */}
        {affected.length > 0 && (
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">
                    How to fix it — Liquid code change
                  </Text>
                  <Badge tone="info">One-time theme edit</Badge>
                </InlineStack>
                <Text as="p" tone="subdued">
                  The root cause is the Liquid <code>| within: collection</code> filter used in
                  product card templates. This filter generates a collection-scoped URL instead of
                  the canonical product URL. One change fixes all affected products permanently.
                </Text>

                <BlockStack gap="200">
                  <Text as="h3" variant="headingSm">
                    File to edit
                  </Text>
                  <Box
                    background="bg-surface-secondary"
                    padding="300"
                    borderRadius="200"
                    borderWidth="025"
                    borderColor="border"
                  >
                    <Text as="p" variant="bodyMd" fontWeight="semibold">
                      Online Store → Themes → Edit code → snippets/card-product.liquid
                    </Text>
                  </Box>
                </BlockStack>

                <BlockStack gap="200">
                  <Text as="h3" variant="headingSm">
                    The change
                  </Text>
                  <InlineStack gap="300" wrap>
                    <Box
                      background="bg-fill-critical-secondary"
                      padding="300"
                      borderRadius="200"
                      borderWidth="025"
                      borderColor="border-critical"
                    >
                      <BlockStack gap="100">
                        <Text as="p" variant="bodySm" fontWeight="semibold" tone="critical">
                          Before (creates duplicates)
                        </Text>
                        <code style={{ fontSize: '12px', fontFamily: 'monospace' }}>
                          {'{{ product.url | within: collection }}'}
                        </code>
                      </BlockStack>
                    </Box>
                    <Box
                      background="bg-fill-success-secondary"
                      padding="300"
                      borderRadius="200"
                      borderWidth="025"
                      borderColor="border-success"
                    >
                      <BlockStack gap="100">
                        <Text as="p" variant="bodySm" fontWeight="semibold" tone="success">
                          After (canonical URL)
                        </Text>
                        <code style={{ fontSize: '12px', fontFamily: 'monospace' }}>
                          {'{{ product.url }}'}
                        </code>
                      </BlockStack>
                    </Box>
                  </InlineStack>
                </BlockStack>

                <Banner tone="info" title="What this does">
                  <Text as="p" variant="bodyMd">
                    Changing <code>| within: collection</code> to nothing makes your theme always
                    link to <code>/products/handle</code> — the canonical URL. This concentrates
                    link equity on one URL per product and eliminates duplicate content. Google will
                    then consistently index the canonical version.
                  </Text>
                </Banner>
              </BlockStack>
            </Card>
          </Layout.Section>
        )}

        {/* Affected products table */}
        {affected.length > 0 && (
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Affected products ({affected.length})
                </Text>
                <Text as="p" tone="subdued">
                  These products are discoverable at multiple URLs. The canonical URL is shown first
                  — it&apos;s where link equity should concentrate.
                </Text>
                <Divider />

                <BlockStack gap="0">
                  {affected.slice(0, 50).map((p, i) => (
                    <Box
                      key={p.id}
                      padding="300"
                      background={i % 2 === 0 ? 'bg-surface' : 'bg-surface-secondary'}
                    >
                      <BlockStack gap="200">
                        <InlineStack align="space-between" blockAlign="center">
                          <BlockStack gap="050">
                            <Text as="p" variant="bodyMd" fontWeight="semibold">
                              {p.title}
                            </Text>
                            <Text as="p" variant="bodySm" tone="success">
                              Canonical: {p.canonicalUrl.replace(baseUrl, '')}
                            </Text>
                          </BlockStack>
                          <Badge tone="critical">{`${p.collections.length} collections`}</Badge>
                        </InlineStack>
                        <BlockStack gap="050">
                          <Text as="p" variant="bodySm" tone="subdued">
                            Also accessible at:
                          </Text>
                          {p.duplicateUrls.slice(0, 4).map((url) => (
                            <Text key={url} as="p" variant="bodySm" tone="critical">
                              ✗ {url.replace(baseUrl, '')}
                            </Text>
                          ))}
                        </BlockStack>
                        <InlineStack gap="100" wrap>
                          {p.collections.map((c) => (
                            <Badge key={c.handle} tone="info" size="small">
                              {c.title}
                            </Badge>
                          ))}
                        </InlineStack>
                      </BlockStack>
                    </Box>
                  ))}
                  {affected.length > 50 && (
                    <Box padding="300">
                      <Text as="p" tone="subdued">
                        + {affected.length - 50} more products affected
                      </Text>
                    </Box>
                  )}
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        )}

        {affected.length === 0 && (
          <Layout.Section>
            <Banner tone="success" title="All products are canonical">
              <Text as="p" variant="bodyMd">
                Every product in your store belongs to at most one collection. You have no
                collection-path duplicate URL risk. This is the ideal structure.
              </Text>
            </Banner>
          </Layout.Section>
        )}

        {/* Explainer */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Why this matters
              </Text>
              <BlockStack gap="200">
                {[
                  {
                    title: 'Link equity dilution',
                    body: 'When 10 blogs link to your product, some may link to the collection-scoped URL instead of the canonical. Google splits the link equity across all versions.',
                  },
                  {
                    title: 'Crawl budget waste',
                    body: 'Googlebot may spend crawl budget on duplicate collection-path URLs instead of discovering new products. Large catalogs are hit hardest.',
                  },
                  {
                    title: 'Indexing inconsistency',
                    body: 'Google treats canonical tags as hints, not directives. When more internal links point to the collection-path URL than the canonical, Google may index the "wrong" version.',
                  },
                  {
                    title: 'Ranking fragmentation',
                    body: 'Ranking signals (user signals, clicks, dwell time) can be split across duplicate URLs, reducing the effective authority of your canonical product pages.',
                  },
                ].map((item) => (
                  <InlineStack key={item.title} align="start" blockAlign="start" gap="200">
                    <Box
                      minWidth="4px"
                      minHeight="40px"
                      background="bg-fill-brand"
                      borderRadius="full"
                    />
                    <BlockStack gap="050">
                      <Text as="p" variant="bodyMd" fontWeight="semibold">
                        {item.title}
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        {item.body}
                      </Text>
                    </BlockStack>
                  </InlineStack>
                ))}
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
