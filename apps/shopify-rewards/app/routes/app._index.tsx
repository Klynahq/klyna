import { type LoaderFunctionArgs } from '@remix-run/node';
import { Link, useLoaderData } from '@remix-run/react';
import {
  Badge,
  BlockStack,
  Box,
  Card,
  InlineGrid,
  InlineStack,
  Layout,
  List,
  Page,
  Text,
} from '@shopify/polaris';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';
import { getProgram } from '../rewards.server';
import { getShopAiSettings } from '../lib/ai.server';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const program = await getProgram(shop);
  const ai = await getShopAiSettings(shop);
  const aiEnabled = ai.provider !== 'off' && !!ai.apiKey;

  const [memberCount, outstanding, redemptionCount, referralsConverted, recentEvents] =
    await Promise.all([
      prisma.member.count({ where: { shop } }),
      prisma.member.aggregate({ where: { shop }, _sum: { balance: true } }),
      prisma.redemption.count({ where: { shop } }),
      prisma.referral.count({ where: { shop, status: 'CONVERTED' } }),
      prisma.pointsEvent.findMany({
        where: { shop },
        orderBy: { createdAt: 'desc' },
        take: 8,
        include: { member: { select: { displayName: true, email: true } } },
      }),
    ]);

  return {
    shop,
    program,
    stats: {
      members: memberCount,
      outstanding: outstanding._sum.balance ?? 0,
      redemptions: redemptionCount,
      referrals: referralsConverted,
    },
    aiEnabled,
    aiProvider: ai.provider,
    recentEvents: recentEvents.map((e) => ({
      id: e.id,
      amount: e.amount,
      reason: e.reason,
      who: e.member.displayName || e.member.email || 'Member',
      at: e.createdAt.toISOString(),
    })),
  };
};

const REASON_TONE: Record<string, 'success' | 'info' | 'warning' | 'attention'> = {
  ORDER: 'success',
  SIGNUP: 'info',
  REVIEW: 'info',
  REFERRAL: 'attention',
  REDEEM: 'warning',
  ADJUST: 'info',
};

export default function Dashboard() {
  const { shop, program, stats, recentEvents, aiEnabled, aiProvider } = useLoaderData<typeof loader>();

  const tiles = [
    {
      label: 'Members',
      value: stats.members.toLocaleString(),
      to: '/app/members',
    },
    {
      label: 'Points outstanding',
      value: stats.outstanding.toLocaleString(),
      to: '/app/members',
    },
    {
      label: 'Redemptions',
      value: stats.redemptions.toLocaleString(),
      to: '/app/members',
    },
    {
      label: 'Referrals converted',
      value: stats.referrals.toLocaleString(),
      to: '/app/referrals',
    },
  ];

  const quicklinks = [
    {
      title: 'Members',
      body: 'See every member, their balance, tier, and award or deduct points by hand.',
      to: '/app/members',
      cta: 'Open',
    },
    {
      title: 'Tiers',
      body: 'Define Bronze to Gold thresholds, earn multipliers, and the perks each unlocks.',
      to: '/app/tiers',
      cta: 'Open',
    },
    {
      title: 'Referrals',
      body: 'Track referral links and the points awarded when a friend converts.',
      to: '/app/referrals',
      cta: 'Open',
    },
    {
      title: 'Settings',
      body: 'Tune earning rules, redemption rate, and the storefront widget copy.',
      to: '/app/settings',
      cta: aiEnabled ? `AI connected via ${aiProvider}` : 'Set up',
    },
  ];

  return (
    <Page
      title="Klyna Rewards"
      subtitle={`Connected to ${shop}`}
      titleMetadata={
        <InlineStack gap="200">
          <Badge tone={program.active ? 'success' : 'critical'}>
            {program.active ? 'Program active' : 'Program paused'}
          </Badge>
          {aiEnabled ? (
            <Badge tone="success">{`AI · ${aiProvider}`}</Badge>
          ) : (
            <Badge tone="info">No AI key set</Badge>
          )}
        </InlineStack>
      }
    >
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">Loyalty that brings customers back.</Text>
              <Text as="p" variant="bodyMd" tone="subdued">
                Members earn {program.pointsPerDollar} point{program.pointsPerDollar === 1 ? '' : 's'}{' '}
                per {program.currencyCode} spent, {program.pointsPerSignup} for signing up, and{' '}
                {program.pointsPerReferral} for every referral that converts. {program.redeemPoints}{' '}
                points redeem for {program.currencyCode} {program.redeemValue} off.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="300">
            {tiles.map((t) => (
              <Card key={t.label}>
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">{t.label}</Text>
                  <Text as="p" variant="heading2xl" fontWeight="bold">{t.value}</Text>
                  <Link to={t.to}>View →</Link>
                </BlockStack>
              </Card>
            ))}
          </InlineGrid>
        </Layout.Section>

        <Layout.Section>
          <InlineGrid columns={{ xs: 1, md: 2 }} gap="300">
            {quicklinks.map((q) => (
              <Card key={q.to}>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingSm">{q.title}</Text>
                  <Text as="p" variant="bodyMd" tone="subdued">{q.body}</Text>
                  <Link to={q.to}>{q.cta} →</Link>
                </BlockStack>
              </Card>
            ))}
          </InlineGrid>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Recent activity</Text>
              {recentEvents.length === 0 ? (
                <Text as="p" tone="subdued">
                  No points awarded yet. Activity appears here as customers sign up,
                  order, and refer friends.
                </Text>
              ) : (
                <List type="bullet">
                  {recentEvents.map((e) => (
                    <List.Item key={e.id}>
                      <InlineStack gap="200" blockAlign="center">
                        <Badge tone={REASON_TONE[e.reason] ?? 'info'}>{e.reason}</Badge>
                        <Text as="span" fontWeight="semibold">
                          {e.amount > 0 ? `+${e.amount}` : e.amount}
                        </Text>
                        <Text as="span">{e.who}</Text>
                        <Box>
                          <Text as="span" tone="subdued" variant="bodySm">
                            {new Date(e.at).toLocaleString()}
                          </Text>
                        </Box>
                      </InlineStack>
                    </List.Item>
                  ))}
                </List>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
