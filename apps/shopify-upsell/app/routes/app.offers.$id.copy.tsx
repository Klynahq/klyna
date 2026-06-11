// Klyna Upsell — AI headline writer.
//
// For a given offer, fetch the cart trigger + each candidate upsell variant.
// Look up live inventory for the candidate via Admin GraphQL, then ask the
// per-shop AI client for three short headline variants tuned to that context.
// The shop owner picks one and we save it to the variant row.

import { type ActionFunctionArgs, type LoaderFunctionArgs, json, redirect } from '@remix-run/node';
import { Form, useActionData, useFetcher, useLoaderData, useNavigation } from '@remix-run/react';
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  InlineStack,
  Layout,
  Link as PolarisLink,
  Page,
  Text,
} from '@shopify/polaris';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';
import { getAiClientForShop, getShopAiSettings } from '../lib/ai.server';

interface CandidateContext {
  variantId: string;
  label: string;
  productGid: string;
  productTitle: string;
  productHandle: string;
  currentHeadline: string;
  ctaText: string;
  discountPercent: number;
  price: string | null;
  inventory: number | null;
  inventoryNote: string;
}

interface OfferContext {
  id: string;
  name: string;
  placement: string;
  triggerType: string;
  triggerLabel: string;
  candidates: CandidateContext[];
}

type AdminGraphql = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

const PRODUCT_INVENTORY_QUERY = `#graphql
  query KlynaUpsellProductInventory($id: ID!) {
    product(id: $id) {
      id
      title
      handle
      totalInventory
      tracksInventory
      priceRangeV2 { minVariantPrice { amount currencyCode } }
    }
  }`;

interface ProductInventoryNode {
  id: string;
  title: string;
  handle: string;
  totalInventory: number | null;
  tracksInventory: boolean;
  priceRangeV2: { minVariantPrice: { amount: string; currencyCode: string } } | null;
}

async function fetchInventory(
  admin: AdminGraphql,
  productGid: string,
): Promise<ProductInventoryNode | null> {
  const res = await admin.graphql(PRODUCT_INVENTORY_QUERY, {
    variables: { id: productGid },
  });
  const body = (await res.json()) as { data?: { product?: ProductInventoryNode | null } };
  return body.data?.product ?? null;
}

function describeInventory(node: ProductInventoryNode | null): string {
  if (!node) return 'unknown';
  if (!node.tracksInventory) return 'inventory not tracked';
  const qty = node.totalInventory ?? 0;
  if (qty <= 0) return 'out of stock';
  if (qty < 10) return `low stock (${qty} left)`;
  if (qty < 50) return `${qty} in stock`;
  return 'plenty in stock';
}

function describeTrigger(type: string, value: string): string {
  if (type === 'product') return 'a specific product in the cart';
  if (type === 'collection') return 'any product from a collection in the cart';
  if (type === 'cart_value') {
    const dollars = (Number(value) || 0) / 100;
    return `cart subtotal reaches $${dollars.toFixed(2)}`;
  }
  return type;
}

function buildPrompt(offer: OfferContext, candidate: CandidateContext): string {
  const lines: string[] = [];
  lines.push('Write 3 short upsell headlines (max 8 words each) for an ecommerce cross-sell widget.');
  lines.push('');
  lines.push(`Trigger: ${describeTrigger(offer.triggerType, offer.triggerLabel)}.`);
  lines.push(`Placement: ${offer.placement === 'cart' ? 'cart drawer' : 'post-purchase thank-you page'}.`);
  lines.push(`Candidate product: ${candidate.productTitle}.`);
  if (candidate.price) lines.push(`Price: $${candidate.price}.`);
  lines.push(`Inventory: ${candidate.inventoryNote}.`);
  if (candidate.discountPercent > 0) {
    lines.push(`Discount on accept: ${candidate.discountPercent}% off.`);
  }
  lines.push('');
  lines.push('Rules:');
  lines.push('- Plain, honest tone. No hype, no superlatives, no emoji.');
  lines.push('- If stock is low, you may hint at scarcity once, without pressure tactics.');
  lines.push('- If a discount applies, you may mention it plainly.');
  lines.push('- Output exactly 3 lines, one headline per line, no numbering, no quotes.');
  return lines.join('\n');
}

function parseHeadlines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*\d.)\s]+/, '').replace(/^["']|["']$/g, '').trim())
    .filter((line) => line.length > 0 && line.length <= 120)
    .slice(0, 3);
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const offer = await prisma.offer.findFirst({
    where: { id: params.id, shop: session.shop },
    include: { variants: { orderBy: { label: 'asc' } } },
  });
  if (!offer) {
    throw new Response('Offer not found', { status: 404 });
  }

  const triggerLabel = offer.triggerType === 'cart_value' ? offer.triggerValue : offer.triggerValue;

  const candidates: CandidateContext[] = [];
  for (const v of offer.variants) {
    const node = v.productGid ? await fetchInventory(admin, v.productGid) : null;
    candidates.push({
      variantId: v.id,
      label: v.label,
      productGid: v.productGid,
      productTitle: v.productTitle || node?.title || 'this product',
      productHandle: v.productHandle,
      currentHeadline: v.headline,
      ctaText: v.ctaText,
      discountPercent: v.discountPercent,
      price: node?.priceRangeV2?.minVariantPrice.amount ?? null,
      inventory: node?.totalInventory ?? null,
      inventoryNote: describeInventory(node),
    });
  }

  const ai = await getShopAiSettings(session.shop);

  const ctx: OfferContext = {
    id: offer.id,
    name: offer.name,
    placement: offer.placement,
    triggerType: offer.triggerType,
    triggerLabel,
    candidates,
  };

  return { offer: ctx, aiOn: ai.provider !== 'off' };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const offer = await prisma.offer.findFirst({
    where: { id: params.id, shop: session.shop },
    include: { variants: { orderBy: { label: 'asc' } } },
  });
  if (!offer) {
    throw new Response('Offer not found', { status: 404 });
  }

  const form = await request.formData();
  const intent = String(form.get('intent') ?? '');

  if (intent === 'save') {
    const variantId = String(form.get('variantId') ?? '');
    const headline = String(form.get('headline') ?? '').trim();
    if (!variantId || !headline) {
      return json({ error: 'Missing variant or headline' }, { status: 400 });
    }
    const owns = offer.variants.some((v) => v.id === variantId);
    if (!owns) {
      return json({ error: 'Variant not found on this offer' }, { status: 404 });
    }
    await prisma.offerVariant.update({
      where: { id: variantId },
      data: { headline },
    });
    return redirect(`/app/offers/${offer.id}/copy?saved=${encodeURIComponent(variantId)}`);
  }

  if (intent === 'generate') {
    const variantId = String(form.get('variantId') ?? '');
    const variant = offer.variants.find((v) => v.id === variantId);
    if (!variant) {
      return json({ error: 'Variant not found on this offer' }, { status: 404 });
    }

    const { admin } = await authenticate.admin(request);
    const node = variant.productGid ? await fetchInventory(admin, variant.productGid) : null;

    const candidate: CandidateContext = {
      variantId: variant.id,
      label: variant.label,
      productGid: variant.productGid,
      productTitle: variant.productTitle || node?.title || 'this product',
      productHandle: variant.productHandle,
      currentHeadline: variant.headline,
      ctaText: variant.ctaText,
      discountPercent: variant.discountPercent,
      price: node?.priceRangeV2?.minVariantPrice.amount ?? null,
      inventory: node?.totalInventory ?? null,
      inventoryNote: describeInventory(node),
    };

    const ctx: OfferContext = {
      id: offer.id,
      name: offer.name,
      placement: offer.placement,
      triggerType: offer.triggerType,
      triggerLabel: offer.triggerValue,
      candidates: [candidate],
    };

    const prompt = buildPrompt(ctx, candidate);
    const ai = await getAiClientForShop(session.shop);
    const result = await ai.complete({ prompt, maxTokens: 200, temperature: 0.7 });

    if (result.error) {
      return json({ variantId, error: result.error, headlines: [] as string[] });
    }
    const headlines = parseHeadlines(result.text);
    if (headlines.length === 0) {
      return json({ variantId, error: 'No headlines returned', headlines: [] as string[] });
    }
    return json({ variantId, error: null, headlines });
  }

  return json({ error: 'Unknown intent' }, { status: 400 });
};

export default function OfferCopy() {
  const { offer, aiOn } = useLoaderData<typeof loader>();
  const data = useActionData<typeof action>();
  const nav = useNavigation();
  const generateFetcher = useFetcher<typeof action>();

  const savedVariantId = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('saved')
    : null;

  const submitting = nav.state === 'submitting';
  const generating = generateFetcher.state === 'submitting';

  const fetcherData = generateFetcher.data;
  const generated = fetcherData && 'headlines' in fetcherData
    ? { variantId: String(fetcherData.variantId ?? ''), headlines: fetcherData.headlines as string[] }
    : null;
  const generateError = fetcherData && 'error' in fetcherData && fetcherData.error
    ? String(fetcherData.error)
    : null;
  const saveError = data && 'error' in data && data.error ? String(data.error) : null;

  return (
    <Page
      title="AI headline writer"
      subtitle={offer.name}
      backAction={{ url: `/app/offers/${offer.id}` }}
    >
      <Layout>
        {!aiOn && (
          <Layout.Section>
            <Banner tone="warning" title="Enable AI in Settings">
              <Text as="p" variant="bodyMd">
                The headline writer uses a free-tier AI provider you bring yourself.
                Add a key on the Settings page to turn it on.
              </Text>
              <Box paddingBlockStart="200">
                <PolarisLink url="/app/settings">Open Settings</PolarisLink>
              </Box>
            </Banner>
          </Layout.Section>
        )}

        {saveError && (
          <Layout.Section>
            <Banner tone="critical" title="Could not save">
              <Text as="p" variant="bodyMd">{saveError}</Text>
            </Banner>
          </Layout.Section>
        )}

        {offer.candidates.length === 0 && (
          <Layout.Section>
            <Banner tone="info" title="No candidate products yet">
              <Text as="p" variant="bodyMd">
                Pick at least one product on the offer editor first.
              </Text>
            </Banner>
          </Layout.Section>
        )}

        {offer.candidates.map((c) => {
          const showHeadlines =
            generated && generated.variantId === c.variantId ? generated.headlines : [];
          const showError =
            fetcherData && 'variantId' in fetcherData && fetcherData.variantId === c.variantId
              ? generateError
              : null;
          const justSaved = savedVariantId === c.variantId;

          return (
            <Layout.Section key={c.variantId}>
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h2" variant="headingMd">
                      Variant {c.label} — {c.productTitle}
                    </Text>
                    <Badge tone={c.inventory !== null && c.inventory < 10 ? 'attention' : 'info'}>
                      {c.inventoryNote}
                    </Badge>
                  </InlineStack>

                  <BlockStack gap="100">
                    <Text as="p" tone="subdued" variant="bodySm">
                      Current headline
                    </Text>
                    <Text as="p" variant="bodyMd">{c.currentHeadline}</Text>
                  </BlockStack>

                  {justSaved && (
                    <Banner tone="success" title="Headline saved" />
                  )}

                  <InlineStack gap="200">
                    <generateFetcher.Form method="post">
                      <input type="hidden" name="intent" value="generate" />
                      <input type="hidden" name="variantId" value={c.variantId} />
                      <Button
                        submit
                        variant="primary"
                        loading={generating && generateFetcher.formData?.get('variantId') === c.variantId}
                        disabled={!aiOn}
                      >
                        Generate 3 headlines
                      </Button>
                    </generateFetcher.Form>
                  </InlineStack>

                  {showError && (
                    <Banner tone="critical" title="AI request failed">
                      <Text as="p" variant="bodyMd">{showError}</Text>
                    </Banner>
                  )}

                  {showHeadlines.length > 0 && (
                    <BlockStack gap="200">
                      <Text as="h3" variant="headingSm">Suggestions</Text>
                      {showHeadlines.map((h, i) => (
                        <Card key={`${c.variantId}-${i}`}>
                          <InlineStack align="space-between" blockAlign="center" gap="300">
                            <Box>
                              <Text as="p" variant="bodyMd">{h}</Text>
                            </Box>
                            <Form method="post">
                              <input type="hidden" name="intent" value="save" />
                              <input type="hidden" name="variantId" value={c.variantId} />
                              <input type="hidden" name="headline" value={h} />
                              <Button submit loading={submitting} variant="secondary">
                                Use this
                              </Button>
                            </Form>
                          </InlineStack>
                        </Card>
                      ))}
                    </BlockStack>
                  )}
                </BlockStack>
              </Card>
            </Layout.Section>
          );
        })}
      </Layout>
    </Page>
  );
}
