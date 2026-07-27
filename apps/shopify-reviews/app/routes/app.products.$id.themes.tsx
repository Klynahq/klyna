// Klyna Reviews — AI review theme summarization.
//
// Concatenates published review text for a product (capped at 8000 chars),
// asks the configured AI provider to extract the top 3 themes with a 2-4 word
// name + one representative quote each, and caches the result for 24 hours.

import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/node';
import { Form, Link as RemixLink, useActionData, useLoaderData, useNavigation } from '@remix-run/react';
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
import { getAiClientForShop, getShopAiSettings } from '../lib/ai.server';
import { useEmbeddedRoute } from '../lib/embedded-routes';

const TEXT_CAP = 8000;
const CACHE_TTL_SECONDS = 60 * 60 * 24;

type Theme = { name: string; quote: string };

function decodeProductGid(id: string): string {
  // The route param is the URL-encoded product GID, e.g. gid%3A%2F%2Fshopify...
  try {
    return decodeURIComponent(id);
  } catch {
    return id;
  }
}

function concatReviews(reviews: { title: string | null; body: string }[]): string {
  const parts: string[] = [];
  let total = 0;
  for (const r of reviews) {
    const piece = r.title ? `${r.title}. ${r.body}` : r.body;
    if (total + piece.length + 2 > TEXT_CAP) {
      parts.push(piece.slice(0, Math.max(0, TEXT_CAP - total)));
      break;
    }
    parts.push(piece);
    total += piece.length + 2;
  }
  return parts.join('\n\n');
}

function buildPrompt(productTitle: string, corpus: string): string {
  return [
    `Customers left reviews for the product "${productTitle}". Read the reviews below and extract the THREE most discussed themes.`,
    '',
    'Rules:',
    '- Each theme name is 2 to 4 words, in title case.',
    '- For each theme, include ONE representative quote pulled verbatim from the reviews (no edits, max 200 chars).',
    '- If the same theme has positive and negative mentions, pick the more common sentiment for the quote.',
    '- Output strict JSON only. No markdown, no preface, no trailing text.',
    '',
    'JSON shape:',
    '{"themes":[{"name":"...","quote":"..."},{"name":"...","quote":"..."},{"name":"...","quote":"..."}]}',
    '',
    '--- REVIEWS START ---',
    corpus,
    '--- REVIEWS END ---',
  ].join('\n');
}

function parseThemes(raw: string): Theme[] | null {
  // Strip code fences or leading prose if the model leaked some.
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  const slice = raw.slice(start, end + 1);
  try {
    const parsed = JSON.parse(slice) as { themes?: unknown };
    if (!parsed.themes || !Array.isArray(parsed.themes)) return null;
    const out: Theme[] = [];
    for (const t of parsed.themes) {
      if (
        t &&
        typeof t === 'object' &&
        typeof (t as { name?: unknown }).name === 'string' &&
        typeof (t as { quote?: unknown }).quote === 'string'
      ) {
        const name = ((t as { name: string }).name).trim();
        const quote = ((t as { quote: string }).quote).trim();
        if (name && quote) out.push({ name, quote });
      }
    }
    return out.length > 0 ? out.slice(0, 3) : null;
  } catch {
    return null;
  }
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const productId = decodeProductGid(params.id ?? '');

  const [reviews, ai] = await Promise.all([
    prisma.review.findMany({
      where: { shop, productId, status: 'published' },
      orderBy: { createdAt: 'desc' },
      select: { title: true, body: true, productTitle: true },
    }),
    getShopAiSettings(shop),
  ]);

  const productTitle = reviews[0]?.productTitle ?? productId;
  const reviewCount = reviews.length;

  return {
    shop,
    productId,
    productTitle,
    reviewCount,
    aiEnabled: ai.provider !== 'off' && !!ai.apiKey,
    aiProvider: ai.provider,
  };
};

type ActionData =
  | { ok: true; themes: Theme[]; source: 'live' | 'cache' }
  | { ok: false; error: string };

async function runAction({ request, params }: ActionFunctionArgs): Promise<ActionData> {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const productId = decodeProductGid(params.id ?? '');

  const ai = await getShopAiSettings(shop);
  if (ai.provider === 'off' || !ai.apiKey) {
    return { ok: false, error: 'AI is off. Enable it in Settings first.' };
  }

  const reviews = await prisma.review.findMany({
    where: { shop, productId, status: 'published' },
    orderBy: { createdAt: 'desc' },
    select: { title: true, body: true, productTitle: true },
  });

  if (reviews.length === 0) {
    return {
      ok: false,
      error: 'No published reviews for this product yet. Approve some reviews first.',
    };
  }

  const productTitle = reviews[0]?.productTitle ?? productId;
  const corpus = concatReviews(reviews);
  const prompt = buildPrompt(productTitle, corpus);
  const cacheKey = `themes:${shop}:${productId}:${reviews.length}`;

  const client = await getAiClientForShop(shop);
  const out = await client.complete({
    prompt,
    temperature: 0.3,
    maxTokens: 500,
    cacheKey,
  });

  if (out.error) {
    return { ok: false, error: out.error };
  }

  const themes = parseThemes(out.text);
  if (!themes) {
    return {
      ok: false,
      error: 'The model did not return parseable JSON. Try again or switch providers.',
    };
  }

  return { ok: true, themes, source: out.source };
}

export const action = async (args: ActionFunctionArgs) => {
  const data = await runAction(args);
  return json(data);
};

export default function ProductThemes() {
  const { productTitle, reviewCount, aiEnabled, aiProvider } = useLoaderData<typeof loader>();
  const embeddedRoute = useEmbeddedRoute();
  const data = useActionData<typeof action>();
  const nav = useNavigation();
  const running = nav.state === 'submitting';

  return (
    <Page
      title="Review themes"
      subtitle={productTitle}
      backAction={{ url: embeddedRoute('/app') }}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <InlineStack gap="200" blockAlign="center">
                <Text as="h2" variant="headingMd">What customers keep mentioning</Text>
                {aiEnabled ? (
                  <Badge tone="success">{`AI · ${aiProvider}`}</Badge>
                ) : (
                  <Badge tone="info">AI off</Badge>
                )}
              </InlineStack>
              <Text as="p" tone="subdued">
                {reviewCount === 0
                  ? 'No published reviews yet for this product.'
                  : `Reads the ${reviewCount} published review${reviewCount === 1 ? '' : 's'} for this product and extracts the top three themes with a representative quote each. Cached for 24 hours per product.`}
              </Text>

              {!aiEnabled && (
                <Banner tone="warning" title="Enable AI in Settings">
                  <Text as="p" variant="bodyMd">
                    Add a free-tier API key (OpenRouter, Groq, or Gemini) on the Settings page,
                    then come back here.
                  </Text>
                  <Box paddingBlockStart="200">
                    <RemixLink to={embeddedRoute('/app/settings')}>Open Settings</RemixLink>
                  </Box>
                </Banner>
              )}

              {aiEnabled && reviewCount > 0 && (
                <Form method="post">
                  <Button submit variant="primary" loading={running}>
                    {running ? 'Summarizing' : 'Summarize themes'}
                  </Button>
                </Form>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        {data && !data.ok && (
          <Layout.Section>
            <Banner tone="critical" title="Could not summarize themes">
              <Text as="p" variant="bodyMd">{data.error}</Text>
            </Banner>
          </Layout.Section>
        )}

        {data && data.ok && (
          <Layout.Section>
            <BlockStack gap="300">
              <InlineStack gap="200" blockAlign="center">
                <Text as="h2" variant="headingMd">Top themes</Text>
                <Badge tone={data.source === 'cache' ? 'info' : 'success'}>
                  {data.source === 'cache' ? 'From cache' : 'Fresh'}
                </Badge>
              </InlineStack>
              {data.themes.map((t, i) => (
                <Card key={`${i}-${t.name}`}>
                  <BlockStack gap="200">
                    <Text as="h3" variant="headingSm">{t.name}</Text>
                    <Box
                      padding="300"
                      borderColor="border"
                      borderWidth="025"
                      borderRadius="200"
                      background="bg-surface-secondary"
                    >
                      <Text as="p" variant="bodyMd">"{t.quote}"</Text>
                    </Box>
                  </BlockStack>
                </Card>
              ))}
            </BlockStack>
          </Layout.Section>
        )}
      </Layout>
    </Page>
  );
}
