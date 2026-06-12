import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/node';
import { Form, useFetcher, useLoaderData } from '@remix-run/react';
import { useState } from 'react';
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  Divider,
  InlineGrid,
  InlineStack,
  Layout,
  Page,
  Spinner,
  Text,
  TextField,
} from '@shopify/polaris';
import { authenticate } from '../shopify.server';

type DatamuseWord = { word: string; score: number; f?: number };

type KeywordResult = {
  seed: string;
  related: DatamuseWord[];
  triggered: DatamuseWord[];
  suggestions: DatamuseWord[];
  presentInStore: string[];
  missingFromStore: string[];
};

async function fetchDatamuse(endpoint: string): Promise<DatamuseWord[]> {
  try {
    const res = await fetch(`https://api.datamuse.com/${endpoint}`, {
      headers: { 'User-Agent': 'KlynaBot/0.1 (+https://klyna.dev)' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as DatamuseWord[];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);

  // Pull product titles as seed suggestions
  type P = { title: string };
  const res = await admin.graphql(`{ products(first: 20) { nodes { title } } }`);
  const data = (await res.json()) as { data: { products: { nodes: P[] } } };
  const productTitles = data.data.products.nodes.map((p) => p.title);

  return json({ productTitles, shop: session.shop });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const form = await request.formData();
  const seed = String(form.get('seed') ?? '').trim().toLowerCase();

  if (!seed) return json({ error: 'Enter a keyword to analyse' }, { status: 400 });

  // Fetch semantic data from Datamuse (free, no key)
  const encoded = encodeURIComponent(seed);
  const [related, triggered, suggestions] = await Promise.all([
    fetchDatamuse(`words?ml=${encoded}&max=30&md=f`),
    fetchDatamuse(`words?rel_trg=${encoded}&max=20&md=f`),
    fetchDatamuse(`sug?s=${encoded}&max=10`),
  ]);

  // Fetch store content to check which terms are present
  type P2 = { title: string; descriptionHtml: string };
  type C2 = { title: string; descriptionHtml: string };
  type Pg2 = { title: string; body: string };

  const [prodRes, collRes, pageRes] = await Promise.all([
    admin.graphql(`{ products(first: 50) { nodes { title descriptionHtml } } }`),
    admin.graphql(`{ collections(first: 30) { nodes { title descriptionHtml } } }`),
    admin.graphql(`{ pages(first: 30) { nodes { title body } } }`),
  ]);

  const [prodData, collData, pageData] = await Promise.all([
    (prodRes.json()) as Promise<{ data: { products: { nodes: P2[] } } }>,
    (collRes.json()) as Promise<{ data: { collections: { nodes: C2[] } } }>,
    (pageRes.json()) as Promise<{ data: { pages: { nodes: Pg2[] } } }>,
  ]);

  const storeText = [
    ...prodData.data.products.nodes.map((p) => `${p.title} ${p.descriptionHtml}`),
    ...collData.data.collections.nodes.map((c) => `${c.title} ${c.descriptionHtml}`),
    ...pageData.data.pages.nodes.map((pg) => `${pg.title} ${pg.body}`),
  ]
    .join(' ')
    .replace(/<[^>]+>/g, ' ')
    .toLowerCase();

  const allTerms = [...new Set([...related, ...triggered].map((w) => w.word))];
  const presentInStore = allTerms.filter((term) => storeText.includes(term));
  const missingFromStore = allTerms.filter((term) => !storeText.includes(term)).slice(0, 30);

  return json<{ result: KeywordResult }>({
    result: {
      seed,
      related: related.slice(0, 20),
      triggered: triggered.slice(0, 15),
      suggestions: suggestions.slice(0, 8),
      presentInStore: presentInStore.slice(0, 20),
      missingFromStore,
    },
  });
};

function WordBadge({ word, present }: { word: string; present: boolean }) {
  return (
    <Badge tone={present ? 'success' : 'warning'} size="small">
      {present ? `✓ ${word}` : word}
    </Badge>
  );
}

export default function KeywordsPage() {
  const { productTitles } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<{ result?: KeywordResult; error?: string }>();
  const [seed, setSeed] = useState('');

  const loading = fetcher.state === 'submitting';
  const result = fetcher.data?.result;
  const error = fetcher.data?.error;

  const useSuggestion = (title: string) => {
    const words = title.toLowerCase().split(/\s+/).slice(0, 3).join(' ');
    setSeed(words);
  };

  return (
    <Page title="Semantic Keyword Analysis" backAction={{ url: '/app' }}>
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <BlockStack gap="100">
                <Text as="h2" variant="headingMd">Discover missing keywords</Text>
                <Text as="p" tone="subdued">
                  Powered by the Datamuse semantic API — completely free, no key required.
                  Enter any keyword and Klyna surfaces related terms, semantic associations,
                  and which ones are missing from your store&apos;s content.
                </Text>
              </BlockStack>

              <Form method="post">
                <InlineStack gap="200" blockAlign="end">
                  <Box minWidth="360px">
                    <TextField
                      label="Keyword or product category"
                      value={seed}
                      onChange={setSeed}
                      name="seed"
                      autoComplete="off"
                      placeholder="e.g. running shoes, leather bag, yoga mat"
                    />
                  </Box>
                  <Button submit variant="primary" loading={loading} disabled={!seed.trim()}>
                    Analyse
                  </Button>
                </InlineStack>
              </Form>

              {productTitles.length > 0 && (
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">Analyse a product:</Text>
                  <InlineStack gap="100" wrap>
                    {productTitles.slice(0, 8).map((t) => (
                      <Button key={t} size="slim" variant="secondary" onClick={() => useSuggestion(t)}>
                        {t.slice(0, 30)}
                      </Button>
                    ))}
                  </InlineStack>
                </BlockStack>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        {loading && (
          <Layout.Section>
            <Card>
              <InlineStack gap="300" blockAlign="center">
                <Spinner size="small" />
                <Text as="p" tone="subdued">Fetching semantic data from Datamuse + scanning store content…</Text>
              </InlineStack>
            </Card>
          </Layout.Section>
        )}

        {error && (
          <Layout.Section>
            <Banner tone="critical" title={error} />
          </Layout.Section>
        )}

        {result && !loading && (
          <>
            {/* Gap summary */}
            <Layout.Section>
              <Card>
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h2" variant="headingMd">
                      Keyword gap for &quot;{result.seed}&quot;
                    </Text>
                    <InlineStack gap="200">
                      <Badge tone="success">{`${result.presentInStore.length} present in store`}</Badge>
                      <Badge tone="critical">{`${result.missingFromStore.length} missing`}</Badge>
                    </InlineStack>
                  </InlineStack>

                  {result.missingFromStore.length > 0 && (
                    <Banner tone="warning" title="Content gap detected">
                      <Text as="p" variant="bodyMd">
                        Your store content doesn&apos;t mention these semantically related terms.
                        Add them naturally to product descriptions and collection pages to increase
                        topical relevance and rank for more long-tail searches.
                      </Text>
                    </Banner>
                  )}

                  <InlineGrid columns={2} gap="400">
                    <BlockStack gap="200">
                      <Text as="h3" variant="headingSm" tone="success">Present in your store</Text>
                      <InlineStack gap="100" wrap>
                        {result.presentInStore.length > 0
                          ? result.presentInStore.map((w) => <WordBadge key={w} word={w} present />)
                          : <Text as="p" variant="bodySm" tone="subdued">None detected</Text>}
                      </InlineStack>
                    </BlockStack>
                    <BlockStack gap="200">
                      <Text as="h3" variant="headingSm" tone="caution">Missing from your store</Text>
                      <InlineStack gap="100" wrap>
                        {result.missingFromStore.map((w) => <WordBadge key={w} word={w} present={false} />)}
                      </InlineStack>
                    </BlockStack>
                  </InlineGrid>
                </BlockStack>
              </Card>
            </Layout.Section>

            {/* Semantic relatives */}
            <Layout.Section>
              <InlineGrid columns={2} gap="300">
                <Card>
                  <BlockStack gap="300">
                    <BlockStack gap="100">
                      <Text as="h3" variant="headingMd">Semantically related</Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Words with similar meaning — add these to descriptions for broader topic coverage.
                      </Text>
                    </BlockStack>
                    <Divider />
                    <BlockStack gap="100">
                      {result.related.map((w) => (
                        <InlineStack key={w.word} align="space-between" blockAlign="center">
                          <Text as="p" variant="bodyMd">{w.word}</Text>
                          <InlineStack gap="100">
                            {result.presentInStore.includes(w.word) && (
                              <Badge tone="success" size="small">In store</Badge>
                            )}
                            {w.f && (
                              <Text as="p" variant="bodySm" tone="subdued">
                                freq {w.f.toFixed(1)}/M
                              </Text>
                            )}
                          </InlineStack>
                        </InlineStack>
                      ))}
                    </BlockStack>
                  </BlockStack>
                </Card>

                <Card>
                  <BlockStack gap="300">
                    <BlockStack gap="100">
                      <Text as="h3" variant="headingMd">Strongly associated terms</Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Words people associate with this topic — great for FAQ answers and buying guides.
                      </Text>
                    </BlockStack>
                    <Divider />
                    <BlockStack gap="100">
                      {result.triggered.map((w) => (
                        <InlineStack key={w.word} align="space-between" blockAlign="center">
                          <Text as="p" variant="bodyMd">{w.word}</Text>
                          {result.presentInStore.includes(w.word) && (
                            <Badge tone="success" size="small">In store</Badge>
                          )}
                        </InlineStack>
                      ))}
                    </BlockStack>
                  </BlockStack>
                </Card>
              </InlineGrid>
            </Layout.Section>

            {/* Search suggestions */}
            {result.suggestions.length > 0 && (
              <Layout.Section>
                <Card>
                  <BlockStack gap="300">
                    <BlockStack gap="100">
                      <Text as="h3" variant="headingMd">Search autocomplete variations</Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Common search query completions — use as product titles, headings, or FAQ questions.
                      </Text>
                    </BlockStack>
                    <InlineStack gap="200" wrap>
                      {result.suggestions.map((w) => (
                        <Box
                          key={w.word}
                          background="bg-surface-secondary"
                          padding="150"
                          borderRadius="200"
                          borderWidth="025"
                          borderColor="border"
                        >
                          <Text as="p" variant="bodyMd">{w.word}</Text>
                        </Box>
                      ))}
                    </InlineStack>
                  </BlockStack>
                </Card>
              </Layout.Section>
            )}

            {/* Actionable tips */}
            <Layout.Section>
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">How to use these keywords</Text>
                  <BlockStack gap="200">
                    {[
                      {
                        tip: `Add "${result.missingFromStore.slice(0, 3).join('", "')}" to product descriptions`,
                        detail: 'Weave missing terms naturally into your descriptions — not as a list, as sentences.',
                        impact: 'High',
                      },
                      {
                        tip: 'Use associated terms as FAQ questions',
                        detail: `Turn "${result.triggered.slice(0, 2).map(w => w.word).join('" and "')}" into FAQ questions on relevant pages.`,
                        impact: 'Medium',
                      },
                      {
                        tip: 'Target search variations as collection names',
                        detail: 'If you sell running shoes, create collections named for the top autocomplete variations.',
                        impact: 'Medium',
                      },
                    ].map((item) => (
                      <InlineStack key={item.tip} align="space-between" blockAlign="start">
                        <BlockStack gap="050">
                          <Text as="p" variant="bodyMd" fontWeight="semibold">{item.tip}</Text>
                          <Text as="p" variant="bodySm" tone="subdued">{item.detail}</Text>
                        </BlockStack>
                        <Badge tone={item.impact === 'High' ? 'success' : 'info'}>{item.impact}</Badge>
                      </InlineStack>
                    ))}
                  </BlockStack>
                </BlockStack>
              </Card>
            </Layout.Section>
          </>
        )}
      </Layout>
    </Page>
  );
}
