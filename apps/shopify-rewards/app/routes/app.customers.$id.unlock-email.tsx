import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/node';
import { Form, useActionData, useLoaderData, useNavigation } from '@remix-run/react';
import {
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  InlineStack,
  Layout,
  Page,
  Text,
  TextField,
} from '@shopify/polaris';
import { useEffect, useState } from 'react';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';
import { getAiClientForShop, getShopAiSettings } from '../lib/ai.server';
import { getProgram } from '../rewards.server';

type RecentOrder = {
  name: string;
  total: string;
  currency: string;
  createdAt: string;
  items: string[];
};

type CustomerSnapshot = {
  customerId: string;
  displayName: string;
  email: string;
  firstName: string;
  lifetimeSpend: string;
  currency: string;
  orderCount: number;
  recentOrders: RecentOrder[];
};

type TierContext = {
  tierName: string;
  perkText: string;
  balance: number;
  lifetime: number;
};

const CUSTOMER_QUERY = `#graphql
  query CustomerDetail($id: ID!) {
    customer(id: $id) {
      id
      email
      displayName
      firstName
      numberOfOrders
      amountSpent { amount currencyCode }
      orders(first: 5, sortKey: PROCESSED_AT, reverse: true) {
        edges {
          node {
            name
            processedAt
            totalPriceSet { presentmentMoney { amount currencyCode } }
            lineItems(first: 5) {
              edges { node { title quantity } }
            }
          }
        }
      }
    }
  }`;

type CustomerQueryResponse = {
  data?: {
    customer?: {
      id: string;
      email: string | null;
      displayName: string | null;
      firstName: string | null;
      numberOfOrders: string | number | null;
      amountSpent: { amount: string; currencyCode: string } | null;
      orders: {
        edges: Array<{
          node: {
            name: string;
            processedAt: string | null;
            totalPriceSet: {
              presentmentMoney: { amount: string; currencyCode: string };
            } | null;
            lineItems: {
              edges: Array<{ node: { title: string; quantity: number } }>;
            };
          };
        }>;
      };
    } | null;
  };
};

async function fetchCustomerSnapshot(
  admin: { graphql: (q: string, opts?: { variables?: Record<string, unknown> }) => Promise<Response> },
  customerGid: string,
): Promise<CustomerSnapshot | null> {
  const res = await admin.graphql(CUSTOMER_QUERY, { variables: { id: customerGid } });
  const body = (await res.json()) as CustomerQueryResponse;
  const node = body.data?.customer;
  if (!node) return null;

  const orderEdges = node.orders?.edges ?? [];
  const recentOrders: RecentOrder[] = orderEdges.map((e) => {
    const money = e.node.totalPriceSet?.presentmentMoney;
    return {
      name: e.node.name,
      total: money?.amount ?? '0',
      currency: money?.currencyCode ?? 'USD',
      createdAt: e.node.processedAt ?? '',
      items: (e.node.lineItems?.edges ?? []).map((li) => {
        const q = li.node.quantity > 1 ? ` x${li.node.quantity}` : '';
        return `${li.node.title}${q}`;
      }),
    };
  });

  const spent = node.amountSpent;
  return {
    customerId: node.id,
    displayName: node.displayName ?? node.email ?? 'there',
    email: node.email ?? '',
    firstName: node.firstName ?? (node.displayName ?? '').split(' ')[0] ?? 'there',
    lifetimeSpend: spent?.amount ?? '0',
    currency: spent?.currencyCode ?? 'USD',
    orderCount: Number(node.numberOfOrders ?? 0),
    recentOrders,
  };
}

function buildPrompt(snap: CustomerSnapshot, tier: TierContext, programName: string): string {
  const orderLines = snap.recentOrders.length
    ? snap.recentOrders
        .map((o) => {
          const itemsTxt = o.items.length ? o.items.join(', ') : 'items';
          return `- ${o.name} (${o.currency} ${o.total}) on ${o.createdAt.slice(0, 10)}: ${itemsTxt}`;
        })
        .join('\n')
    : '- No previous orders on file.';

  return [
    `Write an 80-word email to ${snap.firstName} congratulating them on unlocking the ${tier.tierName} tier in our ${programName} loyalty program.`,
    `Their perk: ${tier.perkText || 'a member-only perk'}.`,
    `Lifetime spend: ${snap.currency} ${snap.lifetimeSpend} across ${snap.orderCount} order(s).`,
    `Current points balance: ${tier.balance}. Lifetime points: ${tier.lifetime}.`,
    'Recent orders (mention at least one specific purchase by name):',
    orderLines,
    '',
    'Rules:',
    '- Exactly one short paragraph, around 80 words.',
    '- Mention at least one specific item by name from the recent orders.',
    '- Plain warm tone. No emoji. No superlatives. No marketing fluff.',
    '- End with a clear next step (use the perk on their next order).',
    '- Output only the email body — no subject line, no greeting line separated out, no signature.',
  ].join('\n');
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const rawId = params.id ?? '';
  const customerGid = rawId.startsWith('gid://') ? rawId : `gid://shopify/Customer/${rawId}`;

  const program = await getProgram(shop);
  const ai = await getShopAiSettings(shop);

  const member = await prisma.member.findUnique({
    where: { shop_customerId: { shop, customerId: customerGid } },
  });

  const tiers = await prisma.tier.findMany({
    where: { shop },
    orderBy: { threshold: 'asc' },
  });

  const snapshot = await fetchCustomerSnapshot(admin, customerGid);

  // Determine current tier from lifetime points; fall back to member.tierName.
  const lifetime = member?.lifetime ?? 0;
  const currentTier = tiers.filter((t) => lifetime >= t.threshold).pop();
  const tier: TierContext = {
    tierName: currentTier?.name ?? member?.tierName ?? 'Member',
    perkText: currentTier?.perkText ?? '',
    balance: member?.balance ?? 0,
    lifetime,
  };

  return json({
    shop,
    customerId: customerGid,
    snapshot,
    member: member
      ? {
          balance: member.balance,
          lifetime: member.lifetime,
          tierName: member.tierName,
          displayName: member.displayName,
        }
      : null,
    tier,
    program: { programName: program.programName, currencyCode: program.currencyCode },
    aiEnabled: ai.provider !== 'off' && !!ai.apiKey,
    aiProvider: ai.provider,
  });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const rawId = params.id ?? '';
  const customerGid = rawId.startsWith('gid://') ? rawId : `gid://shopify/Customer/${rawId}`;

  const ai = await getShopAiSettings(shop);
  if (ai.provider === 'off' || !ai.apiKey) {
    return json({ error: 'Enable AI in Settings before generating copy.' }, { status: 400 });
  }

  const program = await getProgram(shop);
  const member = await prisma.member.findUnique({
    where: { shop_customerId: { shop, customerId: customerGid } },
  });
  const tiers = await prisma.tier.findMany({
    where: { shop },
    orderBy: { threshold: 'asc' },
  });
  const snap = await fetchCustomerSnapshot(admin, customerGid);
  if (!snap) {
    return json({ error: 'Could not load this customer from Shopify.' }, { status: 404 });
  }

  const lifetime = member?.lifetime ?? 0;
  const currentTier = tiers.filter((t) => lifetime >= t.threshold).pop();
  const tier: TierContext = {
    tierName: currentTier?.name ?? member?.tierName ?? 'Member',
    perkText: currentTier?.perkText ?? '',
    balance: member?.balance ?? 0,
    lifetime,
  };

  const client = await getAiClientForShop(shop);
  const prompt = buildPrompt(snap, tier, program.programName);
  const result = await client.complete({ prompt, maxTokens: 260, temperature: 0.5 });

  if (result.error) {
    return json({ error: result.error, text: result.text }, { status: 502 });
  }
  return json({ text: result.text, source: result.source });
};

export default function UnlockEmail() {
  const { snapshot, tier, program, aiEnabled, aiProvider, customerId } =
    useLoaderData<typeof loader>();
  const data = useActionData<typeof action>();
  const nav = useNavigation();
  const generating = nav.state === 'submitting';

  const generated = data && 'text' in data ? (data.text as string) : '';
  const error = data && 'error' in data ? (data.error as string) : '';
  const source = data && 'source' in data ? (data.source as 'live' | 'cache') : null;

  const [draft, setDraft] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (generated) setDraft(generated);
  }, [generated]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const idForUrl = customerId.startsWith('gid://')
    ? customerId.split('/').pop() ?? customerId
    : customerId;

  return (
    <Page
      title="Tier-unlock email"
      subtitle={snapshot ? `For ${snapshot.displayName}` : 'Customer email draft'}
      backAction={{ url: '/app/members' }}
    >
      <Layout>
        {!aiEnabled && (
          <Layout.Section>
            <Banner tone="warning" title="Enable AI in Settings">
              <Text as="p">
                The unlock-email writer uses your AI provider. Add a free-tier key on the
                Settings page to turn it on.
              </Text>
            </Banner>
          </Layout.Section>
        )}

        {error && (
          <Layout.Section>
            <Banner tone="critical" title="AI request failed">
              <Text as="p">{error}</Text>
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Customer context</Text>
              {snapshot ? (
                <BlockStack gap="100">
                  <Text as="p">
                    <Text as="span" fontWeight="semibold">{snapshot.displayName}</Text>
                    {snapshot.email ? ` (${snapshot.email})` : ''}
                  </Text>
                  <Text as="p" tone="subdued">
                    Lifetime spend: {snapshot.currency} {snapshot.lifetimeSpend} across{' '}
                    {snapshot.orderCount} order(s). Points balance: {tier.balance}. Lifetime
                    points: {tier.lifetime}.
                  </Text>
                  <Text as="p">
                    Tier: <Text as="span" fontWeight="semibold">{tier.tierName}</Text>
                    {tier.perkText ? ` — perk: ${tier.perkText}` : ''}
                  </Text>
                  {snapshot.recentOrders.length > 0 && (
                    <Box paddingBlockStart="200">
                      <Text as="p" variant="bodySm" tone="subdued">
                        Recent orders:
                      </Text>
                      <BlockStack gap="050">
                        {snapshot.recentOrders.map((o) => (
                          <Text as="p" key={o.name} variant="bodySm">
                            {o.name} — {o.items.join(', ') || 'items'} ({o.currency} {o.total})
                          </Text>
                        ))}
                      </BlockStack>
                    </Box>
                  )}
                </BlockStack>
              ) : (
                <Text as="p" tone="subdued">
                  Could not load customer {idForUrl} from Shopify.
                </Text>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Generate email</Text>
              <Text as="p" tone="subdued">
                Drafts an 80-word note that references a specific recent purchase and the
                perk this customer just unlocked. {aiEnabled ? `Using ${aiProvider}.` : ''}
              </Text>
              <Form method="post">
                <InlineStack gap="200">
                  <Button submit variant="primary" loading={generating} disabled={!aiEnabled || !snapshot}>
                    {generated ? 'Regenerate' : 'Generate draft'}
                  </Button>
                  {source === 'cache' && (
                    <Text as="span" tone="subdued" variant="bodySm">Served from cache.</Text>
                  )}
                </InlineStack>
              </Form>

              <TextField
                label="Draft"
                value={draft}
                onChange={setDraft}
                multiline={6}
                autoComplete="off"
                placeholder={
                  aiEnabled
                    ? 'Click Generate draft to write the email.'
                    : 'Enable AI in Settings to generate copy. You can still write a draft here.'
                }
              />

              <InlineStack gap="200">
                <Button onClick={copy} disabled={!draft}>
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="100">
              <Text as="h3" variant="headingSm">How this works</Text>
              <Text as="p" tone="subdued" variant="bodyMd">
                We fetch the customer from the Admin GraphQL API (name, lifetime spend,
                last 5 orders), combine it with the {program.programName} tier they just
                unlocked, and ask your AI provider for an 80-word draft. Nothing sends —
                copy the text into your email tool of choice.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
