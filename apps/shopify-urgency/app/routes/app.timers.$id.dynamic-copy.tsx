// Klyna Urgency — AI dynamic scarcity copy generator.
//
// Pulls a snapshot of live inventory and sales velocity over the last 24h for
// either a chosen product or the whole store, then asks the configured AI
// provider for three one-line scarcity messages, each from a different angle
// (stock, social-proof, time). The merchant picks one and we save it to the
// timer's headline.

import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/node';
import { Link, useFetcher, useLoaderData, useNavigation } from '@remix-run/react';
import { useState } from 'react';
import {
  Badge,
  Banner,
  BlockStack,
  Button,
  Card,
  InlineStack,
  Layout,
  Page,
  Select,
  Text,
} from '@shopify/polaris';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';
import { getAiClientForShop, getShopAiSettings } from '../lib/ai.server';

type ProductOption = { gid: string; title: string };

type Snapshot = {
  scope: 'store' | 'product';
  productGid: string;
  productTitle: string;
  inventory: number;
  ordersLast24h: number;
  unitsLast24h: number;
};

// ── Loader: load the timer, the product list, and the current AI status. ──

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const id = String(params.id ?? '');

  const timer = await prisma.countdownTimer.findFirst({ where: { id, shop } });
  if (!timer) {
    throw new Response('Timer not found', { status: 404 });
  }

  const ai = await getShopAiSettings(shop);

  let products: ProductOption[] = [];
  try {
    const res = await admin.graphql(
      `#graphql
        query KlynaUrgencyProducts {
          products(first: 50, sortKey: UPDATED_AT, reverse: true) {
            nodes { id title }
          }
        }
      `,
    );
    const body = (await res.json()) as {
      data?: { products?: { nodes?: { id: string; title: string }[] } };
    };
    products =
      body.data?.products?.nodes?.map((n) => ({ gid: n.id, title: n.title })) ?? [];
  } catch (err) {
    console.error('Klyna Urgency: product fetch failed', err);
  }

  return {
    shop,
    timer: {
      id: timer.id,
      name: timer.name,
      headline: timer.headline,
      endsAt: timer.endsAt ? timer.endsAt.toISOString() : null,
      style: timer.style,
    },
    products,
    aiEnabled: ai.provider !== 'off' && Boolean(ai.apiKey),
    aiProvider: ai.provider,
  };
};

// ── Action: snapshot + AI suggest, or save a chosen line. ──

export const action = async ({ params, request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const id = String(params.id ?? '');
  const form = await request.formData();
  const intent = String(form.get('intent') ?? '');

  const timer = await prisma.countdownTimer.findFirst({ where: { id, shop } });
  if (!timer) {
    return json({ ok: false, error: 'Timer not found.' }, { status: 404 });
  }

  if (intent === 'save') {
    const headline = String(form.get('headline') ?? '').trim().slice(0, 200);
    if (!headline) {
      return json({ ok: false, error: 'Pick one of the suggestions first.' }, { status: 400 });
    }
    await prisma.countdownTimer.update({
      where: { id: timer.id },
      data: { headline },
    });
    return json({ ok: true, saved: true, headline });
  }

  // intent === "suggest"
  const productGid = String(form.get('productGid') ?? '').trim();
  const snapshot = await buildSnapshot(admin, productGid);

  const ai = await getShopAiSettings(shop);
  if (ai.provider === 'off' || !ai.apiKey) {
    return json({
      ok: false,
      error: 'AI is off. Enable a provider in Settings to generate copy.',
      snapshot,
    });
  }

  const client = await getAiClientForShop(shop);

  const endsAt = timer.endsAt ? timer.endsAt.toISOString() : null;
  const scopeLine =
    snapshot.scope === 'product'
      ? `Product: "${snapshot.productTitle}".`
      : 'Scope: the whole store (no single product picked).';

  const prompt = [
    'Write exactly three one-line scarcity messages for a Shopify store countdown widget.',
    'Each line must be under 90 characters, plain ASCII, no emoji, no superlatives, no hype.',
    'Use straight quotes only. Do not invent numbers; only use the numbers given below.',
    'Vary the angle so the three lines are clearly different:',
    '  1) STOCK angle  — lean on the current inventory level.',
    '  2) SOCIAL angle — lean on the units sold in the last 24 hours.',
    '  3) TIME angle   — lean on the timer deadline (if given).',
    '',
    'Return ONLY a JSON array of three strings, like:',
    '["line one","line two","line three"]',
    'No prose, no markdown, no code fence.',
    '',
    '--- snapshot ---',
    scopeLine,
    `Current inventory: ${snapshot.inventory} units.`,
    `Orders in the last 24h: ${snapshot.ordersLast24h}.`,
    `Units sold in the last 24h: ${snapshot.unitsLast24h}.`,
    `Timer ends at: ${endsAt ?? 'no fixed end (evergreen)'}.`,
  ].join('\n');

  const cacheKey = `urgency:dyn:${shop}:${timer.id}:${snapshot.productGid || 'store'}:${snapshot.inventory}:${snapshot.unitsLast24h}`;

  const out = await client.complete({
    prompt,
    maxTokens: 300,
    temperature: 0.4,
    cacheKey,
  });

  if (out.error) {
    return json({ ok: false, error: out.error, snapshot });
  }

  const suggestions = parseSuggestions(out.text);
  if (suggestions.length < 3) {
    return json({
      ok: false,
      error: 'The AI reply did not parse as three lines. Try again.',
      snapshot,
      raw: out.text,
    });
  }

  return json({
    ok: true,
    suggestions,
    snapshot,
    source: out.source,
  });
};

// ── Helpers ──

async function buildSnapshot(
  admin: { graphql: (q: string, opts?: { variables?: Record<string, unknown> }) => Promise<Response> },
  productGid: string,
): Promise<Snapshot> {
  const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  let inventory = 0;
  let ordersLast24h = 0;
  let unitsLast24h = 0;
  let productTitle = '';

  if (productGid) {
    try {
      const res = await admin.graphql(
        `#graphql
          query KlynaUrgencyProduct($id: ID!) {
            product(id: $id) { title totalInventory }
          }
        `,
        { variables: { id: productGid } },
      );
      const body = (await res.json()) as {
        data?: { product?: { title?: string; totalInventory?: number } };
      };
      productTitle = body.data?.product?.title ?? '';
      inventory = body.data?.product?.totalInventory ?? 0;
    } catch (err) {
      console.error('Klyna Urgency: product snapshot failed', err);
    }
  }

  // Orders + units in the last 24h. We scope by product line item title when a
  // product is selected, otherwise count all orders for the shop.
  try {
    const queryStr = productGid
      ? `created_at:>=${sinceIso} line_items.product_id:${productGid.replace('gid://shopify/Product/', '')}`
      : `created_at:>=${sinceIso}`;
    const res = await admin.graphql(
      `#graphql
        query KlynaUrgencyOrders($q: String!) {
          orders(first: 100, query: $q) {
            nodes {
              id
              lineItems(first: 50) {
                nodes { quantity product { id } }
              }
            }
          }
        }
      `,
      { variables: { q: queryStr } },
    );
    const body = (await res.json()) as {
      data?: {
        orders?: {
          nodes?: { id: string; lineItems?: { nodes?: { quantity: number; product?: { id?: string } | null }[] } }[];
        };
      };
    };
    const orders = body.data?.orders?.nodes ?? [];
    ordersLast24h = orders.length;
    for (const o of orders) {
      const lines = o.lineItems?.nodes ?? [];
      for (const li of lines) {
        if (productGid) {
          if (li.product?.id === productGid) {
            unitsLast24h += li.quantity ?? 0;
          }
        } else {
          unitsLast24h += li.quantity ?? 0;
        }
      }
    }
  } catch (err) {
    console.error('Klyna Urgency: orders snapshot failed', err);
  }

  return {
    scope: productGid ? 'product' : 'store',
    productGid,
    productTitle,
    inventory,
    ordersLast24h,
    unitsLast24h,
  };
}

function parseSuggestions(raw: string): string[] {
  const text = raw.trim();
  // Try strict JSON array first.
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed.map((s) => String(s).trim()).filter(Boolean).slice(0, 3);
    }
  } catch {
    // fall through
  }
  // Fallback: extract the first [...] block.
  const m = text.match(/\[[\s\S]*\]/);
  if (m && m[0]) {
    try {
      const parsed = JSON.parse(m[0]);
      if (Array.isArray(parsed)) {
        return parsed.map((s) => String(s).trim()).filter(Boolean).slice(0, 3);
      }
    } catch {
      // fall through
    }
  }
  // Last resort: split into lines.
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^[\s\-\d\.\)"']+/, '').replace(/[",]+$/, '').trim())
    .filter((l) => l.length > 0)
    .slice(0, 3);
}

// ── UI ──

type ActionData = {
  ok: boolean;
  error?: string;
  saved?: boolean;
  headline?: string;
  suggestions?: string[];
  snapshot?: Snapshot;
  source?: 'live' | 'cache';
};

export default function DynamicCopy() {
  const { timer, products, aiEnabled, aiProvider } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<ActionData>();
  const saveNav = useNavigation();

  const [productGid, setProductGid] = useState<string>('');
  const [chosen, setChosen] = useState<string>('');

  const generating = fetcher.state !== 'idle' && (fetcher.formData?.get('intent') ?? '') === 'suggest';
  const saving = saveNav.state === 'submitting';

  const data = fetcher.data;
  const suggestions = data?.suggestions ?? [];
  const snapshot = data?.snapshot;
  const error = data?.error;

  const productOptions = [
    { label: 'Whole store (no single product)', value: '' },
    ...products.map((p) => ({ label: p.title, value: p.gid })),
  ];

  const runSuggest = () => {
    const fd = new FormData();
    fd.set('intent', 'suggest');
    fd.set('productGid', productGid);
    fetcher.submit(fd, { method: 'post' });
  };

  return (
    <Page
      title="Dynamic scarcity copy"
      subtitle={`Timer: ${timer.name}`}
      backAction={{ url: '/app/timers' }}
    >
      <Layout>
        <Layout.Section>
          {!aiEnabled && (
            <Banner tone="warning" title="Enable AI in Settings">
              <Text as="p" variant="bodyMd">
                Dynamic copy needs an AI provider. Add a free-tier key (OpenRouter, Groq,
                or Gemini) under <Link to="/app/settings">Settings</Link>, then come back.
              </Text>
            </Banner>
          )}
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <BlockStack gap="100">
                <InlineStack gap="200" blockAlign="center">
                  <Text as="h2" variant="headingMd">Snapshot</Text>
                  {aiEnabled && <Badge tone="success">{`AI on - ${aiProvider}`}</Badge>}
                </InlineStack>
                <Text as="p" tone="subdued" variant="bodyMd">
                  We pull live inventory and the last 24 hours of orders, then ask the AI
                  for three one-line scarcity messages from different angles. Numbers are
                  passed verbatim - we do not let the model invent stock or sales counts.
                </Text>
              </BlockStack>

              <Select
                label="Scope"
                options={productOptions}
                value={productGid}
                onChange={setProductGid}
              />

              <InlineStack gap="200">
                <Button
                  variant="primary"
                  loading={generating}
                  disabled={!aiEnabled}
                  onClick={runSuggest}
                >
                  Generate three suggestions
                </Button>
                {data?.source === 'cache' && (
                  <Badge tone="info">Served from cache</Badge>
                )}
              </InlineStack>

              {error && (
                <Banner tone="critical" title="Could not generate copy">
                  <Text as="p" variant="bodyMd">{error}</Text>
                </Banner>
              )}

              {snapshot && (
                <Card>
                  <BlockStack gap="100">
                    <Text as="h3" variant="headingSm">Snapshot used</Text>
                    <Text as="p" variant="bodyMd" tone="subdued">
                      {snapshot.scope === 'product'
                        ? `Product: ${snapshot.productTitle || snapshot.productGid}`
                        : 'Whole store'}
                    </Text>
                    <Text as="p" variant="bodyMd">
                      Inventory: <b>{snapshot.inventory}</b>
                      {'  -  '}
                      Orders (24h): <b>{snapshot.ordersLast24h}</b>
                      {'  -  '}
                      Units sold (24h): <b>{snapshot.unitsLast24h}</b>
                    </Text>
                  </BlockStack>
                </Card>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        {suggestions.length > 0 && (
          <Layout.Section>
            <Card>
              <fetcher.Form method="post">
                <input type="hidden" name="intent" value="save" />
                <input type="hidden" name="headline" value={chosen} />
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">Pick one</Text>
                  <Text as="p" tone="subdued" variant="bodyMd">
                    The chosen line replaces this timer's headline.
                  </Text>
                  <BlockStack gap="200">
                    {suggestions.map((s, i) => (
                      <SuggestionRow
                        key={`${i}-${s}`}
                        text={s}
                        angle={ANGLE_LABELS[i] ?? 'Angle'}
                        selected={chosen === s}
                        onSelect={() => setChosen(s)}
                      />
                    ))}
                  </BlockStack>
                  <InlineStack gap="200">
                    <Button
                      submit
                      variant="primary"
                      loading={saving}
                      disabled={!chosen}
                    >
                      Save to timer
                    </Button>
                    <Button onClick={() => setChosen('')}>Clear selection</Button>
                  </InlineStack>
                  {data?.saved && (
                    <Banner tone="success" title="Headline saved">
                      <Text as="p" variant="bodyMd">Timer headline is now: {data.headline}</Text>
                    </Banner>
                  )}
                </BlockStack>
              </fetcher.Form>
            </Card>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card>
            <BlockStack gap="100">
              <Text as="h3" variant="headingSm">Current headline</Text>
              <Text as="p" variant="bodyMd" tone="subdued">{timer.headline}</Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

const ANGLE_LABELS = ['Stock', 'Social proof', 'Time'];

function SuggestionRow({
  text,
  angle,
  selected,
  onSelect,
}: {
  text: string;
  angle: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <Card>
      <BlockStack gap="200">
        <InlineStack align="space-between" blockAlign="center">
          <Badge tone="info">{angle}</Badge>
          <Button
            variant={selected ? 'primary' : 'secondary'}
            onClick={onSelect}
          >
            {selected ? 'Selected' : 'Use this'}
          </Button>
        </InlineStack>
        <Text as="p" variant="bodyMd">{text}</Text>
      </BlockStack>
    </Card>
  );
}
