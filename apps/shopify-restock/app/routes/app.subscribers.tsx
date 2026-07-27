import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/node';
import { Form, useActionData, useLoaderData, useNavigation, useSearchParams } from '@remix-run/react';
import { useCallback } from 'react';
import {
  Badge,
  Banner,
  BlockStack,
  Button,
  Card,
  EmptyState,
  IndexTable,
  InlineStack,
  Layout,
  Page,
  Tabs,
  Text,
  useBreakpoints,
} from '@shopify/polaris';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';
import { useEmbeddedRoute } from '../lib/embedded-routes';
import { getShopPlan, planSelectionUrl } from '../lib/plans.server';

type StatusFilter = 'ALL' | 'PENDING' | 'NOTIFIED' | 'CANCELLED';

const TABS: { id: StatusFilter; content: string }[] = [
  { id: 'ALL', content: 'All' },
  { id: 'PENDING', content: 'Waiting' },
  { id: 'NOTIFIED', content: 'Notified' },
  { id: 'CANCELLED', content: 'Cancelled' },
];

function statusWhere(shop: string, filter: StatusFilter) {
  return filter === 'ALL' ? { shop } : { shop, status: filter };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  const filter = (url.searchParams.get('status') as StatusFilter) ?? 'ALL';

  const [subscribers, planHandle] = await Promise.all([
    prisma.subscription.findMany({
      where: statusWhere(shop, TABS.some((t) => t.id === filter) ? filter : 'ALL'),
      orderBy: { createdAt: 'desc' },
      take: 250,
    }),
    getShopPlan(shop),
  ]);

  return {
    shop,
    filter,
    planHandle,
    pricingUrl: planSelectionUrl(shop),
    subscribers: subscribers.map((s) => ({
      id: s.id,
      contact: s.channel === 'EMAIL' ? s.email : s.phone,
      channel: s.channel,
      product: [s.productTitle, s.variantTitle].filter(Boolean).join(' — '),
      status: s.status,
      createdAt: s.createdAt.toISOString(),
    })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();
  const intent = String(form.get('intent') ?? '');

  if (intent === 'cancel') {
    const id = String(form.get('id') ?? '');
    // Scope the update by shop so one shop can never touch another's rows.
    const updated = await prisma.subscription.updateMany({
      where: { id, shop },
      data: { status: 'CANCELLED' },
    });
    return json({ ok: updated.count > 0, message: 'Subscriber removed.' });
  }

  if (intent === 'rearm') {
    const id = String(form.get('id') ?? '');
    const updated = await prisma.subscription.updateMany({
      where: { id, shop },
      data: { status: 'PENDING', notifiedAt: null },
    });
    return json({ ok: updated.count > 0, message: 'Subscriber re-armed.' });
  }

  if (intent === 'export') {
    if ((await getShopPlan(shop)) !== 'growth') {
      return json(
        { ok: false, message: 'CSV export is available on the Growth plan.' },
        { status: 403 },
      );
    }
    const filter = (String(form.get('status') ?? 'ALL') as StatusFilter);
    const rows = await prisma.subscription.findMany({
      where: statusWhere(shop, TABS.some((t) => t.id === filter) ? filter : 'ALL'),
      orderBy: { createdAt: 'desc' },
    });
    const header = 'status,channel,contact,product,variant,handle,consent,created_at\n';
    const csv =
      header +
      rows
        .map((r) =>
          [
            r.status,
            r.channel,
            r.channel === 'EMAIL' ? r.email : r.phone,
            r.productTitle,
            r.variantTitle ?? '',
            r.productHandle ?? '',
            r.marketingConsent ? 'yes' : 'no',
            r.createdAt.toISOString(),
          ]
            .map(csvCell)
            .join(','),
        )
        .join('\n');

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="klyna-waitlist-${Date.now()}.csv"`,
      },
    });
  }

  return json({ ok: false, message: 'Unknown action.' }, { status: 400 });
};

function csvCell(value: string | null): string {
  const s = value ?? '';
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function Subscribers() {
  const embeddedRoute = useEmbeddedRoute();
  const { subscribers, filter, planHandle, pricingUrl } = useLoaderData<typeof loader>();
  const data = useActionData<typeof action>();
  const nav = useNavigation();
  const { smUp } = useBreakpoints();
  const [, setSearchParams] = useSearchParams();
  const busy = nav.state !== 'idle';

  const selectedTab = Math.max(0, TABS.findIndex((t) => t.id === filter));

  const onTabChange = useCallback(
    (index: number) => {
      const next = TABS[index]?.id ?? 'ALL';
      setSearchParams(next === 'ALL' ? {} : { status: next });
    },
    [setSearchParams],
  );

  const statusBadge = (status: string) =>
    status === 'PENDING' ? (
      <Badge tone="attention">Waiting</Badge>
    ) : status === 'NOTIFIED' ? (
      <Badge tone="success">Notified</Badge>
    ) : (
      <Badge>Cancelled</Badge>
    );

  return (
    <Page
      title="Subscribers"
      subtitle="Everyone on a waitlist, across every variant."
      backAction={{ url: embeddedRoute('/app') }}
    >
      <Layout>
        {planHandle === 'free' && (
          <Layout.Section>
            <Banner
              tone="info"
              title="Free plan: up to 50 active waitlist subscribers"
              action={{ content: 'View Growth plan', url: pricingUrl }}
            >
              <Text as="p">
                Upgrade for unlimited active subscribers, CSV export, SMS capture,
                and smart timing.
              </Text>
            </Banner>
          </Layout.Section>
        )}
        <Layout.Section>
          <Card>
            <InlineStack align="space-between" blockAlign="center" gap="300">
              <Text as="p" variant="bodyMd" tone="subdued">
                Export the current tab — or every signup — as CSV. Your list, your data.
              </Text>
              <Form method="post" reloadDocument>
                <input type="hidden" name="intent" value="export" />
                <input type="hidden" name="status" value={filter} />
                <Button submit disabled={planHandle !== 'growth'}>Export CSV</Button>
              </Form>
            </InlineStack>
          </Card>
        </Layout.Section>

        {data && 'message' in data && (
          <Layout.Section>
            <Card>
              <Text as="p" tone={data.ok ? 'success' : 'critical'}>{data.message}</Text>
            </Card>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card padding="0">
            <Tabs tabs={TABS.map((t) => ({ id: t.id, content: t.content }))} selected={selectedTab} onSelect={onTabChange}>
              {subscribers.length === 0 ? (
                <EmptyState
                  heading="No subscribers in this view"
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>Waitlist signups from your storefront “Notify me” button appear here.</p>
                </EmptyState>
              ) : (
                <IndexTable
                  condensed={!smUp}
                  resourceName={{ singular: 'subscriber', plural: 'subscribers' }}
                  itemCount={subscribers.length}
                  selectable={false}
                  headings={[
                    { title: 'Contact' },
                    { title: 'Product' },
                    { title: 'Channel' },
                    { title: 'Status' },
                    { title: 'Signed up' },
                    { title: '' },
                  ]}
                >
                  {subscribers.map((s, index) => (
                    <IndexTable.Row id={s.id} key={s.id} position={index}>
                      <IndexTable.Cell>
                        <Text as="span" variant="bodyMd" fontWeight="semibold">{s.contact ?? '—'}</Text>
                      </IndexTable.Cell>
                      <IndexTable.Cell>{s.product}</IndexTable.Cell>
                      <IndexTable.Cell>
                        <Badge>{s.channel === 'EMAIL' ? 'Email' : 'SMS'}</Badge>
                      </IndexTable.Cell>
                      <IndexTable.Cell>{statusBadge(s.status)}</IndexTable.Cell>
                      <IndexTable.Cell>
                        <Text as="span" variant="bodySm" tone="subdued">
                          {new Date(s.createdAt).toLocaleDateString()}
                        </Text>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <InlineStack gap="200">
                          {s.status === 'NOTIFIED' && (
                            <Form method="post">
                              <input type="hidden" name="intent" value="rearm" />
                              <input type="hidden" name="id" value={s.id} />
                              <Button submit size="slim" variant="plain" disabled={busy}>
                                Re-arm
                              </Button>
                            </Form>
                          )}
                          {s.status !== 'CANCELLED' && (
                            <Form method="post">
                              <input type="hidden" name="intent" value="cancel" />
                              <input type="hidden" name="id" value={s.id} />
                              <Button submit size="slim" variant="plain" tone="critical" disabled={busy}>
                                Remove
                              </Button>
                            </Form>
                          )}
                        </InlineStack>
                      </IndexTable.Cell>
                    </IndexTable.Row>
                  ))}
                </IndexTable>
              )}
            </Tabs>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <BlockStack gap="100">
            <Text as="p" variant="bodySm" tone="subdued">
              Showing up to 250 most-recent signups. Export CSV for the full list,
              filtered to the current tab.
            </Text>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
