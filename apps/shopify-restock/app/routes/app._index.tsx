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
  Page,
  Text,
} from '@shopify/polaris';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  // Real KPIs straight from the waitlist store.
  const [pending, notified, alertsSent, alertsFailed, topVariants] = await Promise.all([
    prisma.subscription.count({ where: { shop, status: 'PENDING' } }),
    prisma.subscription.count({ where: { shop, status: 'NOTIFIED' } }),
    prisma.alert.count({ where: { shop, status: 'SENT' } }),
    prisma.alert.count({ where: { shop, status: 'FAILED' } }),
    prisma.subscription.groupBy({
      by: ['variantId'],
      where: { shop, status: 'PENDING' },
      _count: { variantId: true },
      orderBy: { _count: { variantId: 'desc' } },
      take: 5,
    }),
  ]);

  // Hydrate the top variants with their cached titles for display.
  const variantIds = topVariants.map((t) => t.variantId);
  const snapshots = await prisma.variantSnapshot.findMany({
    where: { shop, variantId: { in: variantIds } },
  });
  const titleFor = (id: string) => {
    const snap = snapshots.find((s) => s.variantId === id);
    return snap
      ? [snap.productTitle, snap.variantTitle].filter(Boolean).join(' — ')
      : id;
  };

  const top = topVariants.map((t) => ({
    variantId: t.variantId,
    title: titleFor(t.variantId),
    count: t._count.variantId,
  }));

  return { shop, pending, notified, alertsSent, alertsFailed, top };
};

export default function Dashboard() {
  const { shop, pending, notified, alertsSent, alertsFailed, top } =
    useLoaderData<typeof loader>();

  const stats = [
    { label: 'On waitlists', value: pending, hint: 'Shoppers waiting on a restock' },
    { label: 'Notified', value: notified, hint: 'Shoppers alerted when stock returned' },
    { label: 'Alerts sent', value: alertsSent, hint: 'Successful deliveries' },
    { label: 'Failed', value: alertsFailed, hint: 'Deliveries that errored' },
  ];

  const tiles = [
    {
      title: 'Demand report',
      body: 'See which sold-out variants have the most shoppers waiting — your highest-leverage restocks, ranked.',
      to: '/app/demand',
    },
    {
      title: 'Subscribers',
      body: 'Browse, filter, and export every waitlist signup. Remove contacts or re-arm them by hand.',
      to: '/app/subscribers',
    },
    {
      title: 'Settings',
      body: 'Customize the storefront button copy, collect SMS, toggle consent, and tune the resend guard.',
      to: '/app/settings',
    },
  ];

  return (
    <Page title="Klyna Back-in-Stock" subtitle={`Connected to ${shop}`}>
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">Recover the demand you're losing to sold-out.</Text>
              <Text as="p" variant="bodyMd" tone="subdued">
                Klyna adds a “Notify me” button to every sold-out variant, captures
                email &amp; SMS interest, and auto-alerts shoppers the moment inventory
                returns — turning stockouts into a recovery channel instead of lost sales.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <InlineGrid columns={{ xs: 2, md: 4 }} gap="300">
            {stats.map((s) => (
              <Card key={s.label}>
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">{s.label}</Text>
                  <Text as="p" variant="heading2xl" fontWeight="bold">{String(s.value)}</Text>
                  <Text as="p" variant="bodySm" tone="subdued">{s.hint}</Text>
                </BlockStack>
              </Card>
            ))}
          </InlineGrid>
        </Layout.Section>

        {top.length > 0 && (
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">Most-wanted right now</Text>
                  <Link to="/app/demand">Full report →</Link>
                </InlineStack>
                <BlockStack gap="200">
                  {top.map((t) => (
                    <Box key={t.variantId} paddingBlock="100" borderColor="border" borderBlockEndWidth="025">
                      <InlineStack align="space-between" blockAlign="center">
                        <Text as="span" variant="bodyMd">{t.title}</Text>
                        <Badge tone="attention">{`${t.count} waiting`}</Badge>
                      </InlineStack>
                    </Box>
                  ))}
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        )}

        <Layout.Section>
          <InlineGrid columns={{ xs: 1, md: 3 }} gap="300">
            {tiles.map((t) => (
              <Card key={t.to}>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingSm">{t.title}</Text>
                  <Text as="p" variant="bodyMd" tone="subdued">{t.body}</Text>
                  <Link to={t.to}>Open →</Link>
                </BlockStack>
              </Card>
            ))}
          </InlineGrid>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text as="h3" variant="headingSm">Turn on the storefront button</Text>
              <Text as="p" variant="bodyMd" tone="subdued">
                In your theme editor, open a product template and add the
                <Text as="span" fontWeight="semibold"> Klyna Notify me </Text>
                app block (under “Apps”). It renders automatically only when the
                selected variant is sold out — no theme code required.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
