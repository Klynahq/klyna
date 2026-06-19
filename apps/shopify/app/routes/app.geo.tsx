import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/node';
import { useFetcher, useLoaderData } from '@remix-run/react';
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
  ProgressBar,
  Text,
} from '@shopify/polaris';
import { useState } from 'react';
import prisma from '../db.server';
import { authenticate } from '../shopify.server';

// ── GEO Score computation ─────────────────────────────────────────────────────

type GeoSignal = {
  label: string;
  detail: string;
  score: number;
  max: number;
  met: boolean;
};

type GeoResult = {
  total: number;
  maxTotal: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  signals: GeoSignal[];
  llmsTxtContent: string;
  llmsTxtUrl: string | null;
};

function geoGrade(score: number, max: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  const pct = score / max;
  if (pct >= 0.9) return 'A';
  if (pct >= 0.75) return 'B';
  if (pct >= 0.6) return 'C';
  if (pct >= 0.4) return 'D';
  return 'F';
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;

  // Fetch shop + content from Admin API
  type ShopData = {
    data: {
      shop: {
        id: string;
        name: string;
        email: string;
        description: string | null;
        primaryDomain: { url: string };
      };
    };
  };

  type ArticleData = {
    data: {
      articles: {
        nodes: {
          title: string;
          handle: string;
          author: { name: string } | null;
          blog: { handle: string };
        }[];
      };
    };
  };

  type PageData = {
    data: {
      pages: {
        nodes: {
          id: string;
          handle: string;
          title: string;
          body: string;
          onlineStoreUrl: string | null;
        }[];
      };
    };
  };

  type ProductData = {
    data: {
      products: {
        nodes: {
          id: string;
          title: string;
          handle: string;
          descriptionHtml: string;
          onlineStoreUrl: string | null;
          priceRangeV2: { minVariantPrice: { amount: string; currencyCode: string } };
        }[];
      };
    };
  };

  type CollData = {
    data: {
      collections: {
        nodes: { title: string; handle: string; onlineStoreUrl: string | null }[];
      };
    };
  };

  const [shopRes, articlesRes, pagesRes, productsRes, collRes] = await Promise.all([
    admin.graphql(`{
      shop { id name email description primaryDomain { url } }
    }`),
    admin.graphql(`{
      articles(first: 20) {
        nodes { title handle author { name } blog { handle } }
      }
    }`),
    admin.graphql(`{
      pages(first: 50) { nodes { id handle title body onlineStoreUrl } }
    }`),
    admin.graphql(`{
      products(first: 50) {
        nodes {
          id title handle descriptionHtml onlineStoreUrl
          priceRangeV2 { minVariantPrice { amount currencyCode } }
        }
      }
    }`),
    admin.graphql(`{
      collections(first: 30) { nodes { title handle onlineStoreUrl } }
    }`),
  ]);

  const shopData = ((await shopRes.json()) as ShopData).data.shop;
  const articles = ((await articlesRes.json()) as ArticleData).data.articles.nodes;
  const pages = ((await pagesRes.json()) as PageData).data.pages.nodes;
  const products = ((await productsRes.json()) as ProductData).data.products.nodes;
  const collections = ((await collRes.json()) as CollData).data.collections.nodes;

  const storeUrl = shopData.primaryDomain.url.replace(/\/$/, '');

  // ── Schema config
  const schemaConfig = await prisma.schemaConfig.findUnique({ where: { shop } });

  // ── GEO Signals ───────────────────────────────────────────────────────────
  const signals: GeoSignal[] = [];

  // 1. Organization schema enabled
  const orgEnabled = schemaConfig?.orgEnabled ?? false;
  signals.push({
    label: 'Organization schema',
    detail: orgEnabled
      ? 'Organization JSON-LD is active — AI engines can identify your brand as a distinct entity.'
      : 'Enable Organization schema in the Schema Markup module. Critical for entity recognition.',
    score: orgEnabled ? 15 : 0,
    max: 15,
    met: orgEnabled,
  });

  // 2. About page exists
  const aboutPage = pages.find((p) => /about/i.test(p.handle) || /about/i.test(p.title));
  signals.push({
    label: 'About page',
    detail: aboutPage
      ? `Found "${aboutPage.title}" — AI engines use this to understand who you are.`
      : 'Create a detailed About page. AI engines use it to build entity context for your brand.',
    score: aboutPage ? 10 : 0,
    max: 10,
    met: !!aboutPage,
  });

  // 3. Blog content with author attribution
  const articlesWithAuthor = articles.filter((a) => a.author?.name);
  const authorScore = Math.min(10, articlesWithAuthor.length * 3);
  signals.push({
    label: 'Blog posts with author attribution',
    detail:
      articlesWithAuthor.length > 0
        ? `${articlesWithAuthor.length} posts have named authors — E-E-A-T signal for AI engines.`
        : 'Add author attribution to blog posts. AI engines weight content more heavily when authorship is clear.',
    score: authorScore,
    max: 10,
    met: articlesWithAuthor.length > 0,
  });

  // 4. Structured / FAQ content
  const allPageText = pages
    .map((p) => p.body)
    .join(' ')
    .toLowerCase();
  const hasFaq = /\b(faq|frequently asked|question|q:\s|q\.|answer)\b/i.test(allPageText);
  signals.push({
    label: 'FAQ / Q&A content',
    detail: hasFaq
      ? 'FAQ content detected — great for featured snippets and AI-generated answers.'
      : 'Add FAQ sections to key pages. AI engines prefer content structured as direct answers.',
    score: hasFaq ? 10 : 0,
    max: 10,
    met: hasFaq,
  });

  // 5. Product descriptions (thin content check)
  const strippedDescs = products.map(
    (p) =>
      p.descriptionHtml
        .replace(/<[^>]+>/g, ' ')
        .trim()
        .split(/\s+/).length,
  );
  const avgDescWords =
    strippedDescs.length > 0
      ? Math.round(strippedDescs.reduce((a, b) => a + b, 0) / strippedDescs.length)
      : 0;
  const descScore = avgDescWords >= 150 ? 15 : avgDescWords >= 80 ? 8 : avgDescWords >= 30 ? 4 : 0;
  signals.push({
    label: 'Product description depth',
    detail:
      avgDescWords >= 150
        ? `Average ${avgDescWords} words per product — rich content that AI engines can cite.`
        : `Average ${avgDescWords} words per product. AI engines skip thin content. Aim for 150+ words per product.`,
    score: descScore,
    max: 15,
    met: avgDescWords >= 80,
  });

  // 6. llms.txt present (check for Shopify page with handle llms-txt)
  const llmsPage = pages.find((p) => p.handle === 'llms-txt' || p.handle === 'llmstxt');
  signals.push({
    label: 'llms.txt for AI crawlers',
    detail: llmsPage
      ? 'llms.txt page exists — AI engines like ChatGPT and Perplexity can discover your catalog.'
      : 'No llms.txt found. Generate and deploy it below — AI crawlers use it to understand your store.',
    score: llmsPage ? 15 : 0,
    max: 15,
    met: !!llmsPage,
  });

  // 7. Store has facts / numbers in content (citation-ready)
  const productText = products.map((p) => p.descriptionHtml).join(' ');
  const hasNumbers =
    /\d+\s*(mm|cm|kg|lb|oz|ml|g|inch|feet|m\b|year|month|day|hour|%|warranty|guarantee)/i.test(
      productText,
    );
  signals.push({
    label: 'Citation-ready facts in content',
    detail: hasNumbers
      ? 'Measurable facts detected in product content — increases citation probability in AI answers.'
      : 'Add specific facts: dimensions, weight, capacity, certifications, warranty. AI engines prefer citable specifics.',
    score: hasNumbers ? 10 : 0,
    max: 10,
    met: hasNumbers,
  });

  // 8. Contact / trust signals
  const contactPage = pages.find((p) => /contact/i.test(p.handle) || /contact/i.test(p.title));
  const policyPage = pages.find((p) => /privacy|refund|terms/i.test(p.handle));
  const trustScore = (contactPage ? 7 : 0) + (policyPage ? 8 : 0);
  signals.push({
    label: 'Trust signals (contact + policies)',
    detail:
      contactPage && policyPage
        ? 'Contact page and policy pages found — E-E-A-T trust signals for AI and Google.'
        : `Missing: ${!contactPage ? 'contact page' : ''}${!contactPage && !policyPage ? ' and ' : ''}${!policyPage ? 'policy pages (privacy/refund)' : ''}`,
    score: trustScore,
    max: 15,
    met: !!contactPage && !!policyPage,
  });

  const total = signals.reduce((s, sig) => s + sig.score, 0);
  const maxTotal = signals.reduce((s, sig) => s + sig.max, 0);

  // ── Build llms.txt content ────────────────────────────────────────────────
  const llmsTxtContent = buildLlmsTxt(shopData, storeUrl, products, collections, pages, articles);

  return json<{
    geoResult: GeoResult;
    shopName: string;
    storeUrl: string;
    llmsTxtPageExists: boolean;
  }>({
    geoResult: {
      total,
      maxTotal,
      grade: geoGrade(total, maxTotal),
      signals,
      llmsTxtContent,
      llmsTxtUrl: llmsPage ? `${storeUrl}/pages/${llmsPage.handle}` : null,
    },
    shopName: shopData.name,
    storeUrl,
    llmsTxtPageExists: !!llmsPage,
  });
};

function buildLlmsTxt(
  shop: { name: string; description: string | null },
  storeUrl: string,
  products: {
    title: string;
    handle: string;
    onlineStoreUrl: string | null;
    priceRangeV2: { minVariantPrice: { amount: string; currencyCode: string } };
    descriptionHtml: string;
  }[],
  collections: { title: string; handle: string; onlineStoreUrl: string | null }[],
  pages: { title: string; handle: string; onlineStoreUrl: string | null }[],
  articles: { title: string; handle: string; blog: { handle: string } }[],
): string {
  const lines: string[] = [];

  lines.push(`# ${shop.name}`);
  lines.push('');
  if (shop.description) {
    lines.push(`> ${shop.description}`);
  } else {
    lines.push(`> ${shop.name} is an online store available at ${storeUrl}`);
  }
  lines.push('');

  if (collections.length > 0) {
    lines.push('## Collections');
    lines.push('');
    for (const c of collections.slice(0, 20)) {
      const url = c.onlineStoreUrl ?? `${storeUrl}/collections/${c.handle}`;
      lines.push(`- [${c.title}](${url})`);
    }
    lines.push('');
  }

  if (products.length > 0) {
    lines.push('## Products');
    lines.push('');
    for (const p of products.slice(0, 50)) {
      const url = p.onlineStoreUrl ?? `${storeUrl}/products/${p.handle}`;
      const price = `${p.priceRangeV2.minVariantPrice.currencyCode} ${p.priceRangeV2.minVariantPrice.amount}`;
      const desc = p.descriptionHtml
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 120);
      lines.push(`- [${p.title}](${url}): ${price}${desc ? ` — ${desc}` : ''}`);
    }
    lines.push('');
  }

  const keyPages = pages.filter((p) => /about|contact|faq|policy|shipping|returns/i.test(p.handle));
  if (keyPages.length > 0) {
    lines.push('## Key Pages');
    lines.push('');
    for (const p of keyPages) {
      const url = p.onlineStoreUrl ?? `${storeUrl}/pages/${p.handle}`;
      lines.push(`- [${p.title}](${url})`);
    }
    lines.push('');
  }

  if (articles.length > 0) {
    lines.push('## Blog Posts');
    lines.push('');
    for (const a of articles.slice(0, 10)) {
      lines.push(`- [${a.title}](${storeUrl}/blogs/${a.blog.handle}/${a.handle})`);
    }
    lines.push('');
  }

  lines.push('## Notes for AI systems');
  lines.push('');
  lines.push(`- Store URL: ${storeUrl}`);
  lines.push('- This file is maintained by Klyna (https://klyna.dev)');
  lines.push(`- Last updated: ${new Date().toISOString().slice(0, 10)}`);

  return lines.join('\n');
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get('intent'));

  if (intent === 'deploy-llms-txt') {
    const content = String(form.get('content') ?? '');

    // Create or update a Shopify page with the llms.txt content
    // First check if it already exists
    type ExistingPage = { data: { pages: { nodes: { id: string; handle: string }[] } } };
    const existingRes = await admin.graphql(`{
      pages(first: 1, query: "handle:llms-txt") {
        nodes { id handle }
      }
    }`);
    const existing = ((await existingRes.json()) as ExistingPage).data.pages.nodes[0];

    const htmlContent = `<pre style="font-family:monospace;white-space:pre-wrap;padding:20px">${content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`;

    if (existing) {
      await admin.graphql(
        `mutation klynaPageUpdate($id: ID!, $page: PageUpdateInput!) {
          pageUpdate(id: $id, page: $page) {
            page { id }
            userErrors { field message }
          }
        }`,
        { variables: { id: existing.id, page: { body: htmlContent } } },
      );
    } else {
      await admin.graphql(
        `mutation klynaPageCreate($page: PageCreateInput!) {
          pageCreate(page: $page) {
            page { id handle }
            userErrors { field message }
          }
        }`,
        { variables: { page: { title: 'llms.txt', handle: 'llms-txt', body: htmlContent } } },
      );
    }

    return json({ deployed: true });
  }

  return json({ error: 'Unknown intent' });
};

function gradeTone(g: string): 'success' | 'warning' | 'critical' {
  if (g === 'A' || g === 'B') return 'success';
  if (g === 'C' || g === 'D') return 'warning';
  return 'critical';
}

export default function GeoPage() {
  const { geoResult, shopName, storeUrl, llmsTxtPageExists } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<{ deployed?: boolean; error?: string }>();
  const [showContent, setShowContent] = useState(false);

  const deploying = fetcher.state === 'submitting';
  const deployed = fetcher.data?.deployed || llmsTxtPageExists;

  const pct = Math.round((geoResult.total / geoResult.maxTotal) * 100);

  const deployLlmsTxt = () => {
    const fd = new FormData();
    fd.set('intent', 'deploy-llms-txt');
    fd.set('content', geoResult.llmsTxtContent);
    fetcher.submit(fd, { method: 'post' });
  };

  return (
    <Page title="GEO Score — Generative Engine Optimization" backAction={{ url: '/app' }}>
      <Layout>
        {/* GEO Score */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingLg">
                    GEO Score for {shopName}
                  </Text>
                  <Text as="p" tone="subdued">
                    How likely is your store to be cited, featured, or recommended by AI engines
                    like ChatGPT, Gemini, and Perplexity? This score measures the signals AI uses to
                    evaluate, trust, and reference your brand.
                  </Text>
                </BlockStack>
                <InlineStack gap="300" blockAlign="center">
                  <Text as="p" variant="heading2xl" fontWeight="bold">
                    {geoResult.total}
                  </Text>
                  <Text as="p" variant="headingLg" tone="subdued">
                    / {geoResult.maxTotal}
                  </Text>
                  <Badge tone={gradeTone(geoResult.grade)} size="large">
                    {`Grade ${geoResult.grade}`}
                  </Badge>
                </InlineStack>
              </InlineStack>

              <ProgressBar
                progress={pct}
                tone={pct >= 75 ? 'primary' : pct >= 50 ? 'highlight' : 'critical'}
              />

              <Banner
                tone={
                  geoResult.grade === 'A' || geoResult.grade === 'B'
                    ? 'success'
                    : geoResult.grade === 'C'
                      ? 'warning'
                      : 'critical'
                }
                title={
                  geoResult.grade === 'A'
                    ? 'Excellent GEO — your store is AI-citation ready'
                    : geoResult.grade === 'B'
                      ? 'Good GEO — a few improvements will push you to the top'
                      : geoResult.grade === 'C'
                        ? 'Average GEO — AI engines can find you but rarely cite you'
                        : "Poor GEO — AI engines don't have enough signals to trust or cite your store"
                }
              >
                <Text as="p" variant="bodyMd">
                  {geoResult.grade === 'F' || geoResult.grade === 'D'
                    ? 'Start with Organization schema, an About page, and deploying llms.txt. These three actions will have the highest impact on your GEO score.'
                    : 'Focus on the unmet signals below to increase your citation probability with AI search engines.'}
                </Text>
              </Banner>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Signal breakdown */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                GEO signal breakdown
              </Text>
              <BlockStack gap="0">
                {geoResult.signals.map((sig, i) => (
                  <Box
                    key={sig.label}
                    padding="300"
                    background={i % 2 === 0 ? 'bg-surface' : 'bg-surface-secondary'}
                  >
                    <InlineStack align="space-between" blockAlign="start">
                      <BlockStack gap="100">
                        <InlineStack gap="200" blockAlign="center">
                          <Text as="p" variant="bodyMd" fontWeight="semibold">
                            {sig.label}
                          </Text>
                          <Badge tone={sig.met ? 'success' : 'critical'} size="small">
                            {sig.met ? `✓ ${sig.score}/${sig.max}` : `✗ 0/${sig.max}`}
                          </Badge>
                        </InlineStack>
                        <Text as="p" variant="bodySm" tone="subdued">
                          {sig.detail}
                        </Text>
                      </BlockStack>
                      <Box minWidth="80px">
                        <ProgressBar
                          progress={Math.round((sig.score / sig.max) * 100)}
                          tone={sig.met ? 'primary' : 'critical'}
                          size="small"
                        />
                      </Box>
                    </InlineStack>
                  </Box>
                ))}
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* llms.txt */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="100">
                  <InlineStack gap="200" blockAlign="center">
                    <Text as="h2" variant="headingMd">
                      llms.txt — AI catalog file
                    </Text>
                    {deployed && <Badge tone="success">Deployed</Badge>}
                    {!deployed && <Badge tone="warning">Not deployed</Badge>}
                  </InlineStack>
                  <Text as="p" tone="subdued">
                    llms.txt is an emerging standard (like robots.txt but for AI systems) that tells
                    ChatGPT, Perplexity, Gemini, and other AI crawlers what your store sells, who
                    you are, and what content to cite. Klyna generates it automatically from your
                    live product catalog.
                  </Text>
                </BlockStack>
              </InlineStack>

              {deployed && geoResult.llmsTxtUrl && (
                <Banner tone="success" title="llms.txt is live">
                  <Text as="p" variant="bodyMd">
                    Accessible at:{' '}
                    <a href={geoResult.llmsTxtUrl} target="_blank" rel="noopener noreferrer">
                      {geoResult.llmsTxtUrl}
                    </a>
                  </Text>
                </Banner>
              )}

              <InlineStack gap="200">
                {!deployed && (
                  <Button variant="primary" onClick={deployLlmsTxt} loading={deploying}>
                    Deploy llms.txt to store
                  </Button>
                )}
                {deployed && (
                  <Button variant="secondary" onClick={deployLlmsTxt} loading={deploying}>
                    Regenerate + redeploy
                  </Button>
                )}
                <Button variant="secondary" onClick={() => setShowContent((v) => !v)}>
                  {showContent ? 'Hide' : 'Preview'} content
                </Button>
              </InlineStack>

              {fetcher.data?.deployed && (
                <Banner tone="success" title="llms.txt deployed">
                  <BlockStack gap="100">
                    <Text as="p" variant="bodyMd">
                      Your llms.txt is now live at{' '}
                      <a
                        href={`${storeUrl}/pages/llms-txt`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {storeUrl}/pages/llms-txt
                      </a>
                    </Text>
                    <Text as="p" variant="bodyMd">
                      Add a URL redirect in Shopify: <strong>/llms.txt</strong> →{' '}
                      <strong>/pages/llms-txt</strong> so AI crawlers find it at the standard path.
                    </Text>
                  </BlockStack>
                </Banner>
              )}

              {showContent && (
                <Box
                  background="bg-surface-secondary"
                  padding="400"
                  borderRadius="200"
                  borderWidth="025"
                  borderColor="border"
                >
                  <pre
                    style={{
                      margin: 0,
                      fontSize: '12px',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      fontFamily: 'monospace',
                      maxHeight: '400px',
                      overflowY: 'auto',
                    }}
                  >
                    {geoResult.llmsTxtContent}
                  </pre>
                </Box>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* GEO vs SEO explanation */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                What is GEO and why does it matter?
              </Text>
              <InlineGrid columns={2} gap="400">
                {[
                  {
                    title: 'Traditional SEO',
                    points: [
                      "Optimise for Google's ranking algorithm",
                      'Keywords, backlinks, page speed',
                      'Rank on the 10 blue links',
                      'Measured in SERP position',
                    ],
                    tone: 'info' as const,
                  },
                  {
                    title: 'GEO — Generative Engine Optimization',
                    points: [
                      'Optimise for AI engines (ChatGPT, Perplexity, Gemini)',
                      'Entity clarity, citation readiness, structured facts',
                      'Get mentioned in AI-generated answers',
                      'Measured in brand mentions + citation frequency',
                    ],
                    tone: 'success' as const,
                  },
                ].map((section) => (
                  <Card key={section.title}>
                    <BlockStack gap="200">
                      <Badge tone={section.tone}>{section.title}</Badge>
                      <BlockStack gap="100">
                        {section.points.map((p) => (
                          <Text key={p} as="p" variant="bodyMd">
                            · {p}
                          </Text>
                        ))}
                      </BlockStack>
                    </BlockStack>
                  </Card>
                ))}
              </InlineGrid>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
