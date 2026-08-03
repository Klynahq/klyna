import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/node';
import { Form, Link, useActionData, useLoaderData, useNavigation } from '@remix-run/react';
import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  EmptyState,
  IndexTable,
  InlineStack,
  Layout,
  Page,
  Text,
  TextField,
} from '@shopify/polaris';
import { useState } from 'react';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';
import { award, getProgram, makeReferralCode, upsertMember } from '../rewards.server';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  await getProgram(shop);

  const members = await prisma.member.findMany({
    where: { shop },
    orderBy: { balance: 'desc' },
    take: 100,
  });

  return {
    shop,
    members: members.map((m) => ({
      id: m.id,
      customerId: m.customerId,
      displayName: m.displayName,
      email: m.email,
      balance: m.balance,
      lifetime: m.lifetime,
      tierName: m.tierName,
      referralCode: m.referralCode,
    })),
  };
};

// GraphQL: pull the most recent customers so the merchant can enroll them as
// members without waiting for the `customers/create` webhook to fire.
const CUSTOMERS_QUERY = `#graphql
  query SyncCustomers {
    customers(first: 50, sortKey: CREATED_AT, reverse: true) {
      edges {
        node {
          id
          email
          displayName
        }
      }
    }
  }`;

// GraphQL: turn points into a fixed-amount discount code via discountCodeBasicCreate.
const DISCOUNT_CREATE = `#graphql
  mutation CreateRewardDiscount($basic: DiscountCodeBasicInput!) {
    discountCodeBasicCreate(basicCodeDiscount: $basic) {
      codeDiscountNode { id }
      userErrors { field message }
    }
  }`;

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();
  const intent = String(form.get('intent') ?? '');
  const program = await getProgram(shop);

  if (intent === 'sync') {
    let body: {
      data?: { customers?: { edges: { node: { id: string; email: string | null; displayName: string | null } }[] } };
    };

    try {
      const res = await admin.graphql(CUSTOMERS_QUERY);
      body = (await res.json()) as typeof body;
    } catch (error) {
      console.error('Customer sync failed', error);
      const message = error instanceof Error ? error.message : '';
      const needsProtectedDataAccess = message.includes('not approved to access the Customer object');

      return json(
        {
          error: needsProtectedDataAccess
            ? 'Customer sync needs protected customer data access, including Name and Email, enabled for this app in Shopify.'
            : 'Shopify could not return customers. Check the app permissions and try again.',
        },
        { status: 403 },
      );
    }

    const edges = body.data?.customers?.edges ?? [];
    let added = 0;
    for (const { node } of edges) {
      const before = await prisma.member.findUnique({
        where: { shop_customerId: { shop, customerId: node.id } },
      });
      await upsertMember({
        shop,
        customerId: node.id,
        email: node.email,
        displayName: node.displayName,
      });
      if (!before) added += 1;
    }
    return json({ ok: `Synced ${edges.length} customers — ${added} new member${added === 1 ? '' : 's'}.` });
  }

  if (intent === 'award') {
    const memberId = String(form.get('memberId') ?? '');
    const amount = parseInt(String(form.get('amount') ?? '0'), 10);
    if (!memberId || !Number.isFinite(amount) || amount === 0) {
      return json({ error: 'Enter a non-zero point amount.' }, { status: 400 });
    }
    await award({
      shop,
      memberId,
      amount,
      reason: 'ADJUST',
      note: 'Manual adjustment from admin',
    });
    return json({ ok: `${amount > 0 ? 'Awarded' : 'Deducted'} ${Math.abs(amount)} points.` });
  }

  if (intent === 'redeem') {
    const memberId = String(form.get('memberId') ?? '');
    const member = await prisma.member.findUnique({ where: { id: memberId } });
    if (!member) return json({ error: 'Member not found.' }, { status: 404 });
    if (member.balance < program.redeemPoints) {
      return json(
        { error: `Member needs ${program.redeemPoints} points to redeem (has ${member.balance}).` },
        { status: 400 },
      );
    }

    const code = `KLYNA-${makeReferralCode(member.email ?? undefined).split('-')[1]}`;
    const res = await admin.graphql(DISCOUNT_CREATE, {
      variables: {
        basic: {
          title: `Klyna Rewards — ${member.displayName ?? member.email ?? 'member'}`,
          code,
          startsAt: new Date().toISOString(),
          customerSelection: { all: true },
          customerGets: {
            value: {
              discountAmount: {
                amount: program.redeemValue.toFixed(2),
                appliesOnEachItem: false,
              },
            },
            items: { all: true },
          },
          appliesOncePerCustomer: true,
          usageLimit: 1,
        },
      },
    });
    const body = (await res.json()) as {
      data?: {
        discountCodeBasicCreate?: {
          codeDiscountNode?: { id: string } | null;
          userErrors: { field: string[]; message: string }[];
        };
      };
    };
    const result = body.data?.discountCodeBasicCreate;
    const errs = result?.userErrors ?? [];
    if (errs.length || !result?.codeDiscountNode) {
      return json(
        { error: errs[0]?.message ?? 'Could not create discount code.' },
        { status: 400 },
      );
    }

    // Persist the redemption and burn the points in one transaction.
    await prisma.$transaction([
      prisma.redemption.create({
        data: {
          shop,
          memberId,
          pointsSpent: program.redeemPoints,
          value: program.redeemValue,
          currencyCode: program.currencyCode,
          code,
          discountId: result.codeDiscountNode.id,
        },
      }),
      prisma.pointsEvent.create({
        data: {
          shop,
          memberId,
          amount: -program.redeemPoints,
          reason: 'REDEEM',
          note: `Redeemed for code ${code}`,
        },
      }),
      prisma.member.update({
        where: { id: memberId },
        data: { balance: { decrement: program.redeemPoints } },
      }),
    ]);

    return json({
      ok: `Created code ${code} for ${program.currencyCode} ${program.redeemValue} off (-${program.redeemPoints} pts).`,
    });
  }

  return json({ error: 'Unknown action.' }, { status: 400 });
};

export default function Members() {
  const { members } = useLoaderData<typeof loader>();
  const data = useActionData<typeof action>();
  const nav = useNavigation();
  const submitting = nav.state === 'submitting';
  const ok = data && 'ok' in data ? data.ok : null;
  const error = data && 'error' in data ? data.error : null;

  const [adjustAmounts, setAdjustAmounts] = useState<Record<string, string>>({});
  const resourceName = { singular: 'member', plural: 'members' };

  const tierTone = (t: string) =>
    t === 'Gold' ? 'warning' : t === 'Silver' ? 'info' : t ? 'success' : 'new';

  return (
    <Page
      title="Members"
      subtitle={`${members.length} member${members.length === 1 ? '' : 's'}`}
      backAction={{ url: '/app' }}
      primaryAction={
        <Form method="post">
          <input type="hidden" name="intent" value="sync" />
          <Button submit loading={submitting && nav.formData?.get('intent') === 'sync'} variant="primary">
            Sync customers
          </Button>
        </Form>
      }
    >
      <Layout>
        {(ok || error) && (
          <Layout.Section>
            <Box
              padding="300"
              background={error ? 'bg-surface-critical' : 'bg-surface-success'}
              borderRadius="200"
            >
              <Text as="p" tone={error ? 'critical' : 'success'}>{String(ok ?? error)}</Text>
            </Box>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card padding="0">
            {members.length === 0 ? (
              <Box padding="400">
                <EmptyState
                  heading="No members yet"
                  action={{ content: 'Sync customers', url: '/app/members' }}
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>
                    Press "Sync customers" to enroll existing customers, or let new
                    signups and paid orders enroll members automatically.
                  </p>
                </EmptyState>
              </Box>
            ) : (
              <IndexTable
                resourceName={resourceName}
                itemCount={members.length}
                selectable={false}
                headings={[
                  { title: 'Member' },
                  { title: 'Tier' },
                  { title: 'Balance' },
                  { title: 'Lifetime' },
                  { title: 'Referral code' },
                  { title: 'Adjust' },
                  { title: 'Redeem' },
                  { title: 'AI email' },
                ]}
              >
                {members.map((m, index) => (
                  <IndexTable.Row id={m.id} key={m.id} position={index}>
                    <IndexTable.Cell>
                      <BlockStack gap="050">
                        <Text as="span" fontWeight="semibold">
                          {m.displayName || m.email || 'Member'}
                        </Text>
                        {m.email && (
                          <Text as="span" tone="subdued" variant="bodySm">{m.email}</Text>
                        )}
                      </BlockStack>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Badge tone={tierTone(m.tierName)}>{m.tierName || 'Unranked'}</Badge>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Text as="span" fontWeight="semibold">{m.balance.toLocaleString()}</Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Text as="span" tone="subdued">{m.lifetime.toLocaleString()}</Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Text as="span" variant="bodySm">{m.referralCode}</Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Form method="post">
                        <input type="hidden" name="intent" value="award" />
                        <input type="hidden" name="memberId" value={m.id} />
                        <InlineStack gap="100" blockAlign="center" wrap={false}>
                          <Box width="84px">
                            <TextField
                              label=""
                              labelHidden
                              name="amount"
                              type="number"
                              autoComplete="off"
                              placeholder="±pts"
                              value={adjustAmounts[m.id] ?? ''}
                              onChange={(v) => setAdjustAmounts((s) => ({ ...s, [m.id]: v }))}
                            />
                          </Box>
                          <Button submit size="slim">Apply</Button>
                        </InlineStack>
                      </Form>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Form method="post">
                        <input type="hidden" name="intent" value="redeem" />
                        <input type="hidden" name="memberId" value={m.id} />
                        <Button submit size="slim" tone="success" variant="tertiary">
                          Create code
                        </Button>
                      </Form>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Link
                        to={`/app/customers/${encodeURIComponent(m.customerId)}/unlock-email`}
                      >
                        Write
                      </Link>
                    </IndexTable.Cell>
                  </IndexTable.Row>
                ))}
              </IndexTable>
            )}
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
