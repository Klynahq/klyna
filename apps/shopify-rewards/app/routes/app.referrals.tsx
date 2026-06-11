import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/node';
import { Form, useActionData, useLoaderData, useNavigation } from '@remix-run/react';
import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
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
import { award, getProgram } from '../rewards.server';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const program = await getProgram(shop);

  const [referrals, topAdvocates, pending, converted] = await Promise.all([
    prisma.referral.findMany({
      where: { shop },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { referrer: { select: { displayName: true, email: true, referralCode: true } } },
    }),
    prisma.member.findMany({
      where: { shop, referrals: { some: { status: 'CONVERTED' } } },
      orderBy: { lifetime: 'desc' },
      take: 5,
      include: { _count: { select: { referrals: { where: { status: 'CONVERTED' } } } } },
    }),
    prisma.referral.count({ where: { shop, status: 'PENDING' } }),
    prisma.referral.count({ where: { shop, status: 'CONVERTED' } }),
  ]);

  return {
    shop,
    program: { pointsPerReferral: program.pointsPerReferral, refereeDiscountPct: program.refereeDiscountPct },
    stats: { pending, converted },
    referrals: referrals.map((r) => ({
      id: r.id,
      code: r.code,
      referrer: r.referrer.displayName || r.referrer.email || 'Member',
      refereeEmail: r.refereeEmail,
      status: r.status,
      rewardPoints: r.rewardPoints,
      createdAt: r.createdAt.toISOString(),
      convertedAt: r.convertedAt?.toISOString() ?? null,
    })),
    topAdvocates: topAdvocates.map((m) => ({
      id: m.id,
      name: m.displayName || m.email || 'Member',
      code: m.referralCode,
      conversions: m._count.referrals,
    })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const program = await getProgram(shop);
  const form = await request.formData();
  const intent = String(form.get('intent') ?? '');

  if (intent === 'invite') {
    // Record a referral the advocate has shared (status PENDING) by their code.
    const code = String(form.get('code') ?? '').trim();
    const refereeEmail = String(form.get('refereeEmail') ?? '').trim() || null;
    const referrer = await prisma.member.findFirst({ where: { shop, referralCode: code } });
    if (!referrer) return json({ error: `No member owns referral code ${code}.` }, { status: 400 });
    await prisma.referral.create({
      data: { shop, referrerId: referrer.id, code, refereeEmail, status: 'PENDING' },
    });
    return json({ ok: `Referral logged for ${referrer.displayName ?? referrer.email ?? 'member'}.` });
  }

  if (intent === 'convert') {
    const id = String(form.get('id') ?? '');
    const referral = await prisma.referral.findUnique({ where: { id } });
    if (!referral) return json({ error: 'Referral not found.' }, { status: 404 });
    if (referral.status === 'CONVERTED') {
      return json({ error: 'Referral already converted.' }, { status: 400 });
    }
    await prisma.referral.update({
      where: { id },
      data: { status: 'CONVERTED', convertedAt: new Date(), rewardPoints: program.pointsPerReferral },
    });
    if (program.pointsPerReferral > 0) {
      await award({
        shop,
        memberId: referral.referrerId,
        amount: program.pointsPerReferral,
        reason: 'REFERRAL',
        note: `Referral converted${referral.refereeEmail ? ` (${referral.refereeEmail})` : ''}`,
      });
    }
    return json({ ok: `Awarded ${program.pointsPerReferral} points to the advocate.` });
  }

  return json({ error: 'Unknown action.' }, { status: 400 });
};

export default function Referrals() {
  const { program, stats, referrals, topAdvocates } = useLoaderData<typeof loader>();
  const data = useActionData<typeof action>();
  const nav = useNavigation();
  const submitting = nav.state === 'submitting';
  const ok = data && 'ok' in data ? data.ok : null;
  const error = data && 'error' in data ? data.error : null;

  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');

  return (
    <Page
      title="Referrals"
      subtitle={`${stats.converted} converted · ${stats.pending} pending`}
      backAction={{ url: '/app' }}
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
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">How referrals work</Text>
              <Text as="p" tone="subdued">
                Every member gets a unique referral code shown in the storefront widget.
                When a friend uses it and places their first paid order, the advocate earns{' '}
                <Text as="span" fontWeight="semibold">{program.pointsPerReferral} points</Text> and
                the friend gets <Text as="span" fontWeight="semibold">{program.refereeDiscountPct}% off</Text>.
                Conversions are logged automatically from the <code>orders/paid</code> webhook;
                use the form below to log or convert one by hand.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>

        {topAdvocates.length > 0 && (
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Top advocates</Text>
                <InlineStack gap="300" wrap>
                  {topAdvocates.map((a) => (
                    <Box key={a.id} padding="300" background="bg-surface-secondary" borderRadius="200">
                      <BlockStack gap="050">
                        <Text as="span" fontWeight="semibold">{a.name}</Text>
                        <Text as="span" variant="bodySm" tone="subdued">{a.code}</Text>
                        <Badge tone="attention">{`${a.conversions} converted`}</Badge>
                      </BlockStack>
                    </Box>
                  ))}
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Log a referral</Text>
              <Form method="post">
                <input type="hidden" name="intent" value="invite" />
                <InlineStack gap="200" blockAlign="end" wrap>
                  <Box width="220px">
                    <TextField
                      label="Advocate referral code"
                      name="code"
                      autoComplete="off"
                      value={code}
                      onChange={setCode}
                      placeholder="KLYNA-AB12CD"
                    />
                  </Box>
                  <Box width="240px">
                    <TextField
                      label="Friend's email (optional)"
                      name="refereeEmail"
                      type="email"
                      autoComplete="off"
                      value={email}
                      onChange={setEmail}
                      placeholder="friend@example.com"
                    />
                  </Box>
                  <Button submit loading={submitting} variant="primary">Log referral</Button>
                </InlineStack>
              </Form>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card padding="0">
            <Box padding="300">
              <Text as="h2" variant="headingMd">All referrals</Text>
            </Box>
            <IndexTable
              resourceName={{ singular: 'referral', plural: 'referrals' }}
              itemCount={referrals.length}
              selectable={false}
              headings={[
                { title: 'Advocate' },
                { title: 'Code' },
                { title: 'Friend' },
                { title: 'Status' },
                { title: 'Reward' },
                { title: 'Created' },
                { title: '' },
              ]}
              emptyState={
                <Box padding="400">
                  <Text as="p" tone="subdued">
                    No referrals yet. Members share their code from the storefront widget.
                  </Text>
                </Box>
              }
            >
              {referrals.map((r, index) => (
                <IndexTable.Row id={r.id} key={r.id} position={index}>
                  <IndexTable.Cell>
                    <Text as="span" fontWeight="semibold">{r.referrer}</Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Text as="span" variant="bodySm">{r.code}</Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Text as="span">{r.refereeEmail ?? '—'}</Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Badge tone={r.status === 'CONVERTED' ? 'success' : 'attention'}>
                      {r.status}
                    </Badge>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Text as="span">{r.rewardPoints > 0 ? `+${r.rewardPoints}` : '—'}</Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Text as="span" tone="subdued" variant="bodySm">
                      {new Date(r.createdAt).toLocaleDateString()}
                    </Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    {r.status === 'PENDING' ? (
                      <Form method="post">
                        <input type="hidden" name="intent" value="convert" />
                        <input type="hidden" name="id" value={r.id} />
                        <Button submit size="slim" tone="success" variant="tertiary">
                          Mark converted
                        </Button>
                      </Form>
                    ) : (
                      <Text as="span" tone="subdued" variant="bodySm">
                        {r.convertedAt ? new Date(r.convertedAt).toLocaleDateString() : ''}
                      </Text>
                    )}
                  </IndexTable.Cell>
                </IndexTable.Row>
              ))}
            </IndexTable>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
