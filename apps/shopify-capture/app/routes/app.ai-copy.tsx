// AI-assisted popup copy for two useful visitor contexts.
//
// Generates two variants side by side:
//   1. First-time visitor   — a generic 1-line headline (<40ch).
//   2. Returning non-buyer  — a product-aware nudge that references the
//                             last product the visitor viewed.
//
// Both prompts are cached for 24h per prompt hash via getAiClientForShop.
// Merchants review the drafts and copy the strongest option into a popup.

import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/node';
import { Form, useActionData, useLoaderData, useNavigation } from '@remix-run/react';
import { useState } from 'react';
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  InlineGrid,
  InlineStack,
  Layout,
  Page,
  Select,
  Text,
  TextField,
} from '@shopify/polaris';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';
import { getAiClientForShop, getShopAiSettings } from '../lib/ai.server';

type Variant = {
  label: string;
  audience: 'new' | 'returning';
  headline: string;
  source: 'live' | 'cache';
  error?: string;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const ai = await getShopAiSettings(session.shop);
  const popups = await prisma.popup.findMany({
    where: { shop: session.shop },
    select: { id: true, name: true },
    orderBy: { updatedAt: 'desc' },
    take: 50,
  });
  const brand = session.shop.replace('.myshopify.com', '');
  return {
    aiEnabled: ai.provider !== 'off' && !!ai.apiKey,
    aiProvider: ai.provider,
    popups,
    brand,
  };
};

// First-time visitor: generic 1-line headline under 40 chars.
function firstTimePrompt(brand: string, offer: string, tone: string): string {
  return [
    `Write ONE popup headline for a first-time visitor to the Shopify store "${brand}".`,
    `Offer in the popup: ${offer || 'an email signup discount'}.`,
    `Tone: ${tone}.`,
    `Hard constraints: STRICTLY under 40 characters. No emoji. No superlatives.`,
    `No exclamation marks. Output the headline only — no quotes, no prefix.`,
  ].join(' ');
}

// Returning non-buyer: product-aware nudge referencing last viewed product.
function returningPrompt(brand: string, offer: string, tone: string, lastProduct: string): string {
  return [
    `Write ONE popup headline for a RETURNING visitor to the Shopify store "${brand}"`,
    `who has not purchased yet. The last product they viewed was: "${lastProduct}".`,
    `Offer in the popup: ${offer || 'an email signup discount'}.`,
    `Tone: ${tone}.`,
    `Reference the product naturally (a noun, not the full title).`,
    `Hard constraints: under 70 characters. No emoji. No superlatives. No exclamation marks.`,
    `Output the headline only — no quotes, no prefix.`,
  ].join(' ');
}

function clampHeadline(raw: string, maxLen: number): string {
  // Strip quotes the model sometimes wraps around the output, and trim.
  let out = raw.trim().replace(/^["'`]+|["'`]+$/g, '').trim();
  // Remove trailing period — popup headlines rarely use them.
  if (out.endsWith('.')) out = out.slice(0, -1);
  if (out.length > maxLen) {
    const cut = out.slice(0, maxLen);
    const lastSpace = cut.lastIndexOf(' ');
    out = (lastSpace > maxLen - 10 ? cut.slice(0, lastSpace) : cut).trim();
  }
  return out;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();

  const brand = String(form.get('brand') ?? '').trim() || session.shop.replace('.myshopify.com', '');
  const offer = String(form.get('offer') ?? '').trim();
  const tone = String(form.get('tone') ?? 'friendly').trim() || 'friendly';
  const lastProduct = String(form.get('lastProduct') ?? '').trim() || 'a recent product';

  const ai = await getAiClientForShop(session.shop);

  const [first, returning] = await Promise.all([
    ai.complete({
      prompt: firstTimePrompt(brand, offer, tone),
      maxTokens: 40,
      temperature: 0.5,
    }),
    ai.complete({
      prompt: returningPrompt(brand, offer, tone, lastProduct),
      maxTokens: 60,
      temperature: 0.5,
    }),
  ]);

  const variants: Variant[] = [
    {
      label: 'First-time visitor',
      audience: 'new',
      headline: clampHeadline(first.text, 40),
      source: first.source,
      error: first.error,
    },
    {
      label: 'Returning non-buyer',
      audience: 'returning',
      headline: clampHeadline(returning.text, 70),
      source: returning.source,
      error: returning.error,
    },
  ];

  return json({ variants });
};

const TONE_OPTIONS = [
  { label: 'Friendly', value: 'friendly' },
  { label: 'Direct', value: 'direct' },
  { label: 'Playful', value: 'playful' },
  { label: 'Premium', value: 'premium' },
];

export default function AiCopy() {
  const { aiEnabled, aiProvider, popups, brand } = useLoaderData<typeof loader>();
  const data = useActionData<typeof action>();
  const nav = useNavigation();
  const generating = nav.state === 'submitting';

  const [brandName, setBrandName] = useState(brand);
  const [offer, setOffer] = useState('10% off your first order');
  const [tone, setTone] = useState('friendly');
  const [lastProduct, setLastProduct] = useState('Linen Crew Sweater');
  const [copiedAudience, setCopiedAudience] = useState<Variant['audience'] | null>(null);

  const variants: Variant[] = data && 'variants' in data ? data.variants : [];

  return (
    <Page
      title="AI personalized copy"
      subtitle="Generate focused headline options for key visitor contexts"
      backAction={{ url: '/app' }}
    >
      <Layout>
        {!aiEnabled && (
          <Layout.Section>
            <Banner tone="warning" title="Enable AI in Settings">
              <Text as="p" variant="bodyMd">
                Connect a free-tier provider (OpenRouter, Groq, or Gemini) to generate
                personalized headlines. Your key stays on this app's database.
              </Text>
              <Box paddingBlockStart="200">
                <Button url="/app/settings">Open settings</Button>
              </Box>
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <BlockStack gap="100">
                <InlineStack gap="200" blockAlign="center">
                  <Text as="h2" variant="headingMd">Inputs</Text>
                  {aiEnabled ? (
                    <Badge tone="success">{`AI · ${aiProvider}`}</Badge>
                  ) : (
                    <Badge tone="info">AI off</Badge>
                  )}
                </InlineStack>
                <Text as="p" tone="subdued" variant="bodyMd">
                  We generate two variants per run. Cached per prompt for 24 hours so
                  the same inputs cost zero quota.
                </Text>
              </BlockStack>

              <Form method="post">
                <BlockStack gap="300">
                  <InlineGrid columns={{ xs: 1, md: 2 }} gap="300">
                    <TextField
                      label="Brand name"
                      value={brandName}
                      onChange={setBrandName}
                      name="brand"
                      autoComplete="off"
                      helpText="Shown to the model as store context."
                    />
                    <TextField
                      label="Offer"
                      value={offer}
                      onChange={setOffer}
                      name="offer"
                      autoComplete="off"
                      helpText="What the popup actually offers, in plain words."
                    />
                    <Select
                      label="Tone"
                      options={TONE_OPTIONS}
                      value={tone}
                      onChange={setTone}
                      name="tone"
                    />
                    <TextField
                      label="Last viewed product"
                      value={lastProduct}
                      onChange={setLastProduct}
                      name="lastProduct"
                      autoComplete="off"
                      helpText="Gives the returning-visitor draft useful context."
                    />
                  </InlineGrid>

                  <InlineStack gap="200">
                    <Button submit variant="primary" loading={generating} disabled={!aiEnabled}>
                      Generate variants
                    </Button>
                  </InlineStack>
                </BlockStack>
              </Form>
            </BlockStack>
          </Card>
        </Layout.Section>

        {variants.length > 0 && (
          <Layout.Section>
            <InlineGrid columns={{ xs: 1, md: 2 }} gap="300">
              {variants.map((v) => (
                <Card key={v.audience}>
                  <BlockStack gap="300">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text as="h3" variant="headingSm">{v.label}</Text>
                      <Badge tone={v.source === 'cache' ? 'info' : 'success'}>
                        {v.source === 'cache' ? 'cached' : 'live'}
                      </Badge>
                    </InlineStack>

                    {v.error ? (
                      <Banner tone="critical" title="AI request failed">
                        <Text as="p" variant="bodyMd">{v.error}</Text>
                      </Banner>
                    ) : (
                      <>
                        <Box
                          padding="400"
                          background="bg-surface-secondary"
                          borderRadius="200"
                          borderWidth="025"
                          borderColor="border"
                        >
                          <Text as="p" variant="headingLg" alignment="center">
                            {v.headline || '...'}
                          </Text>
                        </Box>
                        <Text as="p" tone="subdued" variant="bodySm">
                          {v.headline.length} characters ·{' '}
                          {v.audience === 'new'
                            ? 'written for a first-time visitor'
                            : 'written for a returning visitor'}
                        </Text>
                        <Button
                          onClick={() => {
                            void navigator.clipboard.writeText(v.headline);
                            setCopiedAudience(v.audience);
                            window.setTimeout(() => setCopiedAudience(null), 1500);
                          }}
                        >
                          {copiedAudience === v.audience ? 'Copied' : 'Copy headline'}
                        </Button>
                      </>
                    )}
                  </BlockStack>
                </Card>
              ))}
            </InlineGrid>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">How to use these headlines</Text>
              <Text as="p" tone="subdued" variant="bodyMd">
                Generate two concise options, compare them, and copy the strongest one
                into a popup. Generation happens only when you request it and never on
                the storefront, so popup rendering stays fast and predictable.
              </Text>
              {popups.length === 0 ? (
                <Text as="p" tone="subdued" variant="bodyMd">
                  Create a popup first to attach generated headlines.
                </Text>
              ) : (
                <Text as="p" tone="subdued" variant="bodyMd">
                  You have {popups.length} popup{popups.length === 1 ? '' : 's'}. Open
                  one from the Popups page and paste the headline you choose into its
                  Headline field.
                </Text>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
