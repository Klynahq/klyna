import { linking } from '@klyna/core';
import { type LoaderFunctionArgs, json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  Divider,
  InlineGrid,
  InlineStack,
  Layout,
  Page,
  Text,
} from '@shopify/polaris';
import { useState } from 'react';
import { authenticate } from '../shopify.server';

type LinkSuggestion = linking.LinkSuggestion;

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractLinks(html: string, baseUrl: string): string[] {
  const links: string[] = [];
  const re = /href=["']([^"']+)["']/gi;
  let m = re.exec(html);
  while (m !== null) {
    const href = m[1] ?? '';
    if (href.startsWith('/')) {
      try {
        const url = new URL(href, baseUrl);
        links.push(url.href);
      } catch {
        // skip
      }
    } else if (href.startsWith(baseUrl)) {
      links.push(href);
    }
    m = re.exec(html);
  }
  return links;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);

  type ShopRes = { data: { shop: { primaryDomain: { url: string }; myshopifyDomain: string } } };
  const shopRes = await admin.graphql('{ shop { primaryDomain { url } myshopifyDomain } }');
  const {
    data: { shop: shopData },
  } = (await shopRes.json()) as ShopRes;
  const baseUrl = shopData.primaryDomain.url.replace(/\/$/, '');

  // Fetch content from Admin API (no storefront fetch needed)
  type P = { id: string; handle: string; title: string; descriptionHtml: string };
  type C = { id: string; handle: string; title: string; descriptionHtml: string };
  type Pg = { id: string; handle: string; title: string; body: string };

  const [productsRes, collectionsRes, pagesRes] = await Promise.all([
    admin.graphql(`{
      products(first: 50) {
        nodes { id handle title descriptionHtml }
      }
    }`),
    admin.graphql(`{
      collections(first: 30) {
        nodes { id handle title descriptionHtml }
      }
    }`),
    admin.graphql(`{
      pages(first: 30) {
        nodes { id handle title body }
      }
    }`),
  ]);

  const productsJson = (await productsRes.json()) as { data: { products: { nodes: P[] } } };
  const collectionsJson = (await collectionsRes.json()) as {
    data: { collections: { nodes: C[] } };
  };
  const pagesJson = (await pagesRes.json()) as { data: { pages: { nodes: Pg[] } } };

  const pages: linking.LinkingPage[] = [
    ...productsJson.data.products.nodes.map((p) => {
      const url = `${baseUrl}/products/${p.handle}`;
      const text = stripHtml(p.descriptionHtml);
      return { url, title: p.title, text, outLinks: extractLinks(p.descriptionHtml, baseUrl) };
    }),
    ...collectionsJson.data.collections.nodes.map((c) => {
      const url = `${baseUrl}/collections/${c.handle}`;
      const text = stripHtml(c.descriptionHtml);
      return { url, title: c.title, text, outLinks: extractLinks(c.descriptionHtml, baseUrl) };
    }),
    ...pagesJson.data.pages.nodes.map((pg) => {
      const url = `${baseUrl}/pages/${pg.handle}`;
      const text = stripHtml(pg.body);
      return { url, title: pg.title, text, outLinks: extractLinks(pg.body, baseUrl) };
    }),
  ];

  const suggestions =
    pages.length >= 2 ? linking.suggestLinks(pages, { perPage: 5, minSimilarity: 0.05 }) : [];
  const orphans = pages.length >= 2 ? linking.findOrphans(pages) : [];

  // Sort suggestions by similarity desc, take top 50
  const topSuggestions = suggestions
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 50)
    .map((s) => ({
      fromUrl: s.fromUrl,
      toUrl: s.toUrl,
      toTitle: s.toTitle,
      similarity: s.similarity,
      suggestedAnchor: s.suggestedAnchor,
    }));

  return json({
    suggestions: topSuggestions,
    orphans,
    pageCount: pages.length,
  });
};

export default function LinksPage() {
  const { suggestions, orphans, pageCount } = useLoaderData<typeof loader>();
  const [filter, setFilter] = useState<'all' | 'high'>('all');

  const filtered = suggestions.filter((s) => (filter === 'high' ? s.similarity >= 0.15 : true));

  const simBadge = (sim: number) => {
    if (sim >= 0.3) return { label: 'Strong', tone: 'success' as const };
    if (sim >= 0.15) return { label: 'Moderate', tone: 'warning' as const };
    return { label: 'Weak', tone: 'info' as const };
  };

  return (
    <Page title="Internal Links" backAction={{ url: '/app' }}>
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingMd">
                    Semantic link suggestions
                  </Text>
                  <Text as="p" tone="subdued">
                    Klyna analyses {pageCount} pages using TF-IDF cosine similarity and surfaces the
                    strongest missing internal links. Add them to increase topical authority and
                    help Google discover more pages.
                  </Text>
                </BlockStack>
                <InlineStack gap="200">
                  {(['all', 'high'] as const).map((f) => (
                    <Button
                      key={f}
                      size="slim"
                      variant={filter === f ? 'primary' : 'secondary'}
                      onClick={() => setFilter(f)}
                    >
                      {f === 'all' ? `All (${suggestions.length})` : 'High confidence'}
                    </Button>
                  ))}
                </InlineStack>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {filtered.length > 0 && (
          <Layout.Section>
            <Card>
              <BlockStack gap="0">
                {/* Header */}
                <Box padding="300" background="bg-surface-secondary">
                  <InlineGrid columns={['oneThird', 'oneThird', 'oneThird']} gap="200">
                    <Text as="p" variant="bodySm" fontWeight="semibold" tone="subdued">
                      From page
                    </Text>
                    <Text as="p" variant="bodySm" fontWeight="semibold" tone="subdued">
                      Should link to
                    </Text>
                    <Text as="p" variant="bodySm" fontWeight="semibold" tone="subdued">
                      Suggested anchor · Relevance
                    </Text>
                  </InlineGrid>
                </Box>
                <Divider />

                {filtered.map((s, i) => {
                  const badge = simBadge(s.similarity);
                  return (
                    <Box
                      key={`${s.fromUrl}-${s.toUrl}`}
                      padding="300"
                      background={i % 2 === 0 ? 'bg-surface' : 'bg-surface-secondary'}
                    >
                      <InlineGrid columns={['oneThird', 'oneThird', 'oneThird']} gap="200">
                        <BlockStack gap="050">
                          <Text as="p" variant="bodyMd" breakWord>
                            {s.fromUrl.replace(/^https?:\/\/[^/]+/, '') || '/'}
                          </Text>
                        </BlockStack>
                        <BlockStack gap="050">
                          <Text as="p" variant="bodyMd" fontWeight="semibold" breakWord>
                            {s.toTitle}
                          </Text>
                          <Text as="p" variant="bodySm" tone="subdued" breakWord>
                            {s.toUrl.replace(/^https?:\/\/[^/]+/, '')}
                          </Text>
                        </BlockStack>
                        <BlockStack gap="100">
                          <InlineStack gap="200" blockAlign="center">
                            <Box
                              background="bg-surface-secondary"
                              padding="100"
                              borderRadius="100"
                              borderWidth="025"
                              borderColor="border"
                            >
                              <Text as="p" variant="bodySm" fontWeight="semibold">
                                &quot;{s.suggestedAnchor}&quot;
                              </Text>
                            </Box>
                            <Badge tone={badge.tone} size="small">
                              {badge.label}
                            </Badge>
                          </InlineStack>
                          <Text as="p" variant="bodySm" tone="subdued">
                            {Math.round(s.similarity * 100)}% similarity
                          </Text>
                        </BlockStack>
                      </InlineGrid>
                    </Box>
                  );
                })}
              </BlockStack>
            </Card>
          </Layout.Section>
        )}

        {filtered.length === 0 && suggestions.length > 0 && (
          <Layout.Section>
            <Card>
              <Text as="p" tone="subdued">
                No high-confidence suggestions found. Switch to &quot;All&quot; to see weaker
                matches.
              </Text>
            </Card>
          </Layout.Section>
        )}

        {suggestions.length === 0 && pageCount >= 2 && (
          <Layout.Section>
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  No link suggestions
                </Text>
                <Text as="p" tone="subdued">
                  All your pages are already well-interlinked, or their content doesn&apos;t overlap
                  enough to suggest additional links. Add more descriptive content to product and
                  collection pages to improve semantic matching.
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        )}

        {pageCount < 2 && (
          <Layout.Section>
            <Card>
              <Text as="p" tone="subdued">
                Need at least 2 pages with content to compute link suggestions.
              </Text>
            </Card>
          </Layout.Section>
        )}

        {/* Orphaned pages */}
        {orphans.length > 0 && (
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">
                    Orphaned pages
                  </Text>
                  <Badge tone="critical">{`${orphans.length} pages`}</Badge>
                </InlineStack>
                <Text as="p" tone="subdued">
                  These pages have no internal links pointing to them. Google may struggle to
                  discover and index them. Link to them from related products, collections, or
                  pages.
                </Text>
                <BlockStack gap="100">
                  {orphans.map((url) => (
                    <Text key={url} as="p" variant="bodyMd">
                      {url.replace(/^https?:\/\/[^/]+/, '')}
                    </Text>
                  ))}
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        )}
      </Layout>
    </Page>
  );
}
