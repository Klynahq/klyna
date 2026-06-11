// AI per-channel product title rewrites.
//
// For each product, we run three parallel completions tuned to how Google,
// Meta, and Pinterest each rank and click. The results are persisted in
// FeedTitleOverride and picked up automatically by the next feed render.

import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/node';
import { useActionData, useLoaderData, useNavigation, useSubmit } from '@remix-run/react';
import { useEffect, useState } from 'react';
import {
  Badge,
  Banner,
  BlockStack,
  Button,
  Card,
  InlineStack,
  Layout,
  Link,
  Page,
  Text,
} from '@shopify/polaris';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';
import { getAiClientForShop, getShopAiSettings } from '../lib/ai.server';

type ChannelKey = 'google' | 'meta' | 'pinterest';

const CHANNEL_LABEL: Record<ChannelKey, string> = {
  google: 'Google',
  meta: 'Meta',
  pinterest: 'Pinterest',
};

const CHANNEL_LIMIT: Record<ChannelKey, number> = {
  google: 70,
  meta: 60,
  pinterest: 50,
};

const CHANNEL_PROMPT: Record<ChannelKey, (title: string, description: string, vendor: string, productType: string) => string> = {
  google: (t, d, v, p) =>
    [
      'Rewrite this product title for Google Shopping.',
      'Goal: keyword-dense and specific. Lead with the brand, product type, and the highest-intent qualifiers (material, size, color, model number).',
      'Hard limit: 70 characters. No emoji, no superlatives, no claims you cannot verify.',
      'Return only the rewritten title on one line.',
      '',
      `Brand: ${v || 'unknown'}`,
      `Product type: ${p || 'unknown'}`,
      `Current title: ${t}`,
      `Description (first 240 chars): ${d.slice(0, 240)}`,
    ].join('\n'),
  meta: (t, d, v, p) =>
    [
      'Rewrite this product title for a Meta (Facebook and Instagram) catalog ad.',
      'Goal: conversational and scroll-stopping. Sound human. Mention who it is for or the moment it fits, not just specs.',
      'Hard limit: 60 characters. No emoji, no superlatives, no claims you cannot verify.',
      'Return only the rewritten title on one line.',
      '',
      `Brand: ${v || 'unknown'}`,
      `Product type: ${p || 'unknown'}`,
      `Current title: ${t}`,
      `Description (first 240 chars): ${d.slice(0, 240)}`,
    ].join('\n'),
  pinterest: (t, d, v, p) =>
    [
      'Rewrite this product title for a Pinterest product pin.',
      'Goal: lifestyle and inspirational. Frame the product around the look, the room, the outfit, or the use case it slots into.',
      'Hard limit: 50 characters. No emoji, no superlatives, no claims you cannot verify.',
      'Return only the rewritten title on one line.',
      '',
      `Brand: ${v || 'unknown'}`,
      `Product type: ${p || 'unknown'}`,
      `Current title: ${t}`,
      `Description (first 240 chars): ${d.slice(0, 240)}`,
    ].join('\n'),
};

const CHANNELS: ChannelKey[] = ['google', 'meta', 'pinterest'];

interface ProductLite {
  id: string;
  title: string;
  description: string;
  vendor: string;
  productType: string;
}

const PRODUCTS_QUERY = `#graphql
  query KlynaOptimizeTitles {
    products(first: 25, sortKey: UPDATED_AT, reverse: true) {
      nodes {
        id
        title
        descriptionHtml
        vendor
        productType
      }
    }
  }
`;

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function cleanTitle(raw: string, limit: number): string {
  let text = raw.trim();
  // Drop leading/trailing quotes the model sometimes wraps with.
  text = text.replace(/^["'`]+|["'`]+$/g, '').trim();
  // Take the first line only — single-title contract.
  const firstLine = text.split(/\r?\n/)[0] ?? '';
  text = firstLine.trim();
  if (text.length > limit) text = text.slice(0, limit).trim();
  return text;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const ai = await getShopAiSettings(session.shop);

  const res = await admin.graphql(PRODUCTS_QUERY);
  const payload = (await res.json()) as {
    data?: { products: { nodes: { id: string; title: string; descriptionHtml: string; vendor: string; productType: string }[] } };
  };
  const nodes = payload.data?.products.nodes ?? [];
  const products: ProductLite[] = nodes.map((n) => ({
    id: n.id,
    title: n.title,
    description: stripHtml(n.descriptionHtml ?? ''),
    vendor: n.vendor ?? '',
    productType: n.productType ?? '',
  }));

  const overrideRows = await prisma.feedTitleOverride.findMany({
    where: { shop: session.shop, productId: { in: products.map((p) => p.id) } },
  });
  const overrides: Record<string, Partial<Record<ChannelKey, string>>> = {};
  for (const row of overrideRows) {
    const productOverrides = overrides[row.productId] ?? {};
    productOverrides[row.channel as ChannelKey] = row.title;
    overrides[row.productId] = productOverrides;
  }

  return {
    aiEnabled: ai.provider !== 'off' && !!ai.apiKey,
    aiProvider: ai.provider,
    products,
    overrides,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const productId = String(form.get('productId') ?? '');
  const title = String(form.get('title') ?? '');
  const description = String(form.get('description') ?? '');
  const vendor = String(form.get('vendor') ?? '');
  const productType = String(form.get('productType') ?? '');

  if (!productId || !title) {
    return json({ ok: false, error: 'Missing product fields.' }, { status: 400 });
  }

  const settings = await getShopAiSettings(session.shop);
  if (settings.provider === 'off' || !settings.apiKey) {
    return json({ ok: false, error: 'Enable AI in Settings first.' }, { status: 400 });
  }

  const client = await getAiClientForShop(session.shop);

  const results = await Promise.all(
    CHANNELS.map(async (channel) => {
      const prompt = CHANNEL_PROMPT[channel](title, description, vendor, productType);
      const out = await client.complete({
        prompt,
        maxTokens: 80,
        temperature: 0.5,
        cacheKey: `title:${channel}:${productId}:${title}`,
      });
      return { channel, output: out };
    }),
  );

  const firstError = results.find((r) => r.output.error)?.output.error;
  if (firstError) {
    return json({ ok: false, error: firstError, productId });
  }

  const generated: Partial<Record<ChannelKey, string>> = {};
  for (const { channel, output } of results) {
    const cleaned = cleanTitle(output.text, CHANNEL_LIMIT[channel]);
    if (!cleaned) continue;
    generated[channel] = cleaned;
    await prisma.feedTitleOverride.upsert({
      where: { shop_productId_channel: { shop: session.shop, productId, channel } },
      update: { title: cleaned },
      create: { shop: session.shop, productId, channel, title: cleaned },
    });
  }

  return json({ ok: true, productId, generated });
};

export default function OptimizeTitles() {
  const { aiEnabled, aiProvider, products, overrides } = useLoaderData<typeof loader>();
  const data = useActionData<typeof action>();
  const nav = useNavigation();
  const submit = useSubmit();
  const submitting = nav.state === 'submitting';

  const submittedId =
    submitting && nav.formData ? String(nav.formData.get('productId') ?? '') : '';

  const [latest, setLatest] = useState<Record<string, Partial<Record<ChannelKey, string>>>>({});

  // Roll the action result into local state so newly-generated titles show
  // up next to the existing overrides without a full reload.
  useEffect(() => {
    if (!data || !('ok' in data) || !data.ok) return;
    if (!('generated' in data) || !('productId' in data)) return;
    const productId = data.productId;
    const generated = data.generated;
    if (!productId || !generated) return;
    setLatest((s) => ({ ...s, [productId]: generated }));
  }, [data]);

  const optimize = (p: ProductLite) => {
    const fd = new FormData();
    fd.set('productId', p.id);
    fd.set('title', p.title);
    fd.set('description', p.description);
    fd.set('vendor', p.vendor);
    fd.set('productType', p.productType);
    submit(fd, { method: 'post' });
  };

  const error = data && 'error' in data && data.error ? data.error : null;

  return (
    <Page
      title="AI title rewrites"
      subtitle="Per-channel titles tuned for Google, Meta, and Pinterest."
      backAction={{ url: '/app' }}
    >
      <Layout>
        {!aiEnabled && (
          <Layout.Section>
            <Banner tone="warning" title="Enable AI in Settings">
              <Text as="p" variant="bodyMd">
                Title rewrites need a free-tier AI provider. Add a key on the{' '}
                <Link url="/app/settings">Settings page</Link> and come back.
              </Text>
            </Banner>
          </Layout.Section>
        )}

        {error && (
          <Layout.Section>
            <Banner tone="critical" title="AI request failed">
              <Text as="p" variant="bodyMd">{String(error)}</Text>
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <InlineStack gap="200" blockAlign="center">
                <Text as="h2" variant="headingMd">How this works</Text>
                {aiEnabled && <Badge tone="success">{`AI . ${aiProvider}`}</Badge>}
              </InlineStack>
              <Text as="p" tone="subdued">
                Klyna runs three parallel prompts per product, one per channel: Google
                (70 characters, keyword-dense), Meta (60 characters, conversational),
                Pinterest (50 characters, lifestyle). Approved titles are saved per
                channel and applied the next time the matching feed regenerates.
                CSV channels (Meta, TikTok, Pinterest) all read the Meta override.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <BlockStack gap="300">
            {products.length === 0 && (
              <Card>
                <Text as="p" tone="subdued">No products found in this store yet.</Text>
              </Card>
            )}
            {products.map((p) => {
              const saved = overrides[p.id] ?? {};
              const freshlyGenerated = latest[p.id] ?? {};
              const display: Partial<Record<ChannelKey, string>> = { ...saved, ...freshlyGenerated };
              const isWorking = submittedId === p.id && submitting;
              return (
                <Card key={p.id}>
                  <BlockStack gap="300">
                    <InlineStack align="space-between" blockAlign="start" gap="300">
                      <BlockStack gap="050">
                        <Text as="h3" variant="headingSm">{p.title}</Text>
                        <Text as="span" variant="bodySm" tone="subdued">
                          {p.vendor || 'No brand'} . {p.productType || 'No type'}
                        </Text>
                      </BlockStack>
                      <Button
                        variant="primary"
                        onClick={() => optimize(p)}
                        loading={isWorking}
                        disabled={!aiEnabled || submitting}
                      >
                        {Object.keys(saved).length > 0 ? 'Regenerate' : 'Optimize'}
                      </Button>
                    </InlineStack>

                    <BlockStack gap="200">
                      {CHANNELS.map((channel) => {
                        const value = display[channel];
                        return (
                          <InlineStack
                            key={channel}
                            gap="300"
                            blockAlign="start"
                            wrap={false}
                          >
                            <div style={{ minWidth: 90 }}>
                              <Badge>{`${CHANNEL_LABEL[channel]} . ${CHANNEL_LIMIT[channel]}ch`}</Badge>
                            </div>
                            <Text as="span" variant="bodyMd">
                              {value
                                ? `${value} (${value.length} chars)`
                                : 'Not generated yet.'}
                            </Text>
                          </InlineStack>
                        );
                      })}
                    </BlockStack>
                  </BlockStack>
                </Card>
              );
            })}
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
