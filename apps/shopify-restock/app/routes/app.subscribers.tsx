import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/node';
import {
  Form,
  useActionData,
  useLoaderData,
  useNavigation,
  useSearchParams,
} from '@remix-run/react';
import {
  Badge,
  Banner,
  BlockStack,
  Button,
  Card,
  EmptyState,
  InlineStack,
  Layout,
  Page,
  Tabs,
  Text,
} from '@shopify/polaris';
import { useCallback } from 'react';
import prisma from '../db.server';
import { useEmbeddedRoute } from '../lib/embedded-routes';
import { getShopPlan, planSelectionUrl } from '../lib/plans.server';
import { authenticate } from '../shopify.server';

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
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  const filter = (url.searchParams.get('status') as StatusFilter) ?? 'ALL';

  const [subscribers, planHandle] = await Promise.all([
    prisma.subscription.findMany({
      where: statusWhere(shop, TABS.some((t) => t.id === filter) ? filter : 'ALL'),
      orderBy: { createdAt: 'desc' },
      take: 250,
    }),
    getShopPlan(shop, admin),
  ]);

  return {
    shop,
    filter,
    planHandle,
    pricingUrl: planSelectionUrl(shop),
    subscribers: subscribers.map((s) => ({
      id: s.id,
      contact: s.email ?? s.phone,
      product: [s.productTitle, s.variantTitle].filter(Boolean).join(' — '),
      status: s.status,
      createdAt: s.createdAt.toISOString(),
      createdAtLabel: formatDate(s.createdAt),
    })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
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
    if ((await getShopPlan(shop, admin)) !== 'growth') {
      return json(
        { ok: false, message: 'CSV export is available on the Growth plan.' },
        { status: 403 },
      );
    }
    const filter = String(form.get('status') ?? 'ALL') as StatusFilter;
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

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
    year: 'numeric',
  }).format(date);
}

export default function Subscribers() {
  const embeddedRoute = useEmbeddedRoute();
  const { subscribers, filter, planHandle, pricingUrl } = useLoaderData<typeof loader>();
  const data = useActionData<typeof action>();
  const nav = useNavigation();
  const [, setSearchParams] = useSearchParams();
  const busy = nav.state !== 'idle';

  const selectedTab = Math.max(
    0,
    TABS.findIndex((t) => t.id === filter),
  );

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
                Upgrade for unlimited active subscribers, CSV export, smart timing, and AI
                assistance.
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
              <form method="post">
                <input type="hidden" name="intent" value="export" />
                <input type="hidden" name="status" value={filter} />
                <Button submit disabled={planHandle !== 'growth'}>
                  Export CSV
                </Button>
              </form>
            </InlineStack>
          </Card>
        </Layout.Section>

        {data && typeof data === 'object' && 'message' in data && (
          <Layout.Section>
            <Card>
              <Text as="p" tone={data.ok ? 'success' : 'critical'}>
                {data.message}
              </Text>
            </Card>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card padding="0">
            <Tabs
              tabs={TABS.map((t) => ({ id: t.id, content: t.content }))}
              selected={selectedTab}
              onSelect={onTabChange}
            >
              {subscribers.length === 0 ? (
                <EmptyState
                  heading="No subscribers in this view"
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>Waitlist signups from your storefront “Notify me” button appear here.</p>
                </EmptyState>
              ) : (
                <div className="KlynaDataTableWrap">
                  <table className="KlynaDataTable KlynaDataTable--subscribers">
                    <thead>
                      <tr>
                        <th scope="col">Contact</th>
                        <th scope="col">Product</th>
                        <th scope="col">Status</th>
                        <th scope="col">Signed up</th>
                        <th scope="col">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {subscribers.map((s) => (
                        <tr key={s.id}>
                          <td data-label="Contact">
                            <Text as="span" variant="bodyMd" fontWeight="semibold">
                              {s.contact ?? '—'}
                            </Text>
                          </td>
                          <td data-label="Product">{s.product}</td>
                          <td data-label="Status">{statusBadge(s.status)}</td>
                          <td data-label="Signed up">
                            <Text as="span" variant="bodySm" tone="subdued">
                              {s.createdAtLabel}
                            </Text>
                          </td>
                          <td className="KlynaDataTable__actions" data-label="Action">
                            {s.status === 'CANCELLED' ? (
                              <Text as="span" variant="bodySm" tone="subdued">
                                No action
                              </Text>
                            ) : (
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
                                <Form method="post">
                                  <input type="hidden" name="intent" value="cancel" />
                                  <input type="hidden" name="id" value={s.id} />
                                  <Button
                                    submit
                                    size="slim"
                                    variant="plain"
                                    tone="critical"
                                    disabled={busy}
                                  >
                                    Remove
                                  </Button>
                                </Form>
                              </InlineStack>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Tabs>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <BlockStack gap="100">
            <Text as="p" variant="bodySm" tone="subdued">
              Showing up to 250 most-recent signups. Export CSV for the full list, filtered to the
              current tab.
            </Text>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
