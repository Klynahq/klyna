import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/node';
import { Form, useActionData, useLoaderData, useNavigation } from '@remix-run/react';
import {
  Badge,
  BlockStack,
  Button,
  Card,
  EmptyState,
  IndexTable,
  InlineStack,
  Layout,
  Page,
  Text,
  useBreakpoints,
} from '@shopify/polaris';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';
import { useEmbeddedRoute } from '../lib/embedded-routes';
import { syncWaitlistedVariants } from '../services/inventory.server';
import { flushVariant, storefrontProductUrl } from '../services/waitlist.server';

interface DemandRow {
  variantId: string;
  title: string;
  handle: string | null;
  imageUrl: string | null;
  price: string | null;
  waiting: number;
  emailWaiting: number;
  smsWaiting: number;
  available: number | null;
  inStock: boolean;
  productUrl: string;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  // Rank sold-out variants by how many shoppers are waiting. We aggregate per
  // variant + channel so the merchant sees the email/SMS split.
  const grouped = await prisma.subscription.groupBy({
    by: ['variantId', 'channel'],
    where: { shop, status: 'PENDING' },
    _count: { _all: true },
  });

  const byVariant = new Map<string, { email: number; sms: number }>();
  for (const g of grouped) {
    const entry = byVariant.get(g.variantId) ?? { email: 0, sms: 0 };
    if (g.channel === 'EMAIL') entry.email += g._count._all;
    else entry.sms += g._count._all;
    byVariant.set(g.variantId, entry);
  }

  const variantIds = [...byVariant.keys()];
  const [snapshots, subscriptions] = await Promise.all([
    prisma.variantSnapshot.findMany({
      where: { shop, variantId: { in: variantIds } },
    }),
    prisma.subscription.findMany({
      where: { shop, status: 'PENDING', variantId: { in: variantIds } },
      distinct: ['variantId'],
      select: { variantId: true, productTitle: true, variantTitle: true },
    }),
  ]);
  const snapFor = (id: string) => snapshots.find((s) => s.variantId === id);
  const subscriptionFor = (id: string) =>
    subscriptions.find((subscription) => subscription.variantId === id);

  const rows: DemandRow[] = variantIds
    .map((variantId) => {
      const counts = byVariant.get(variantId)!;
      const snap = snapFor(variantId);
      const subscription = subscriptionFor(variantId);
      const title = [
        snap?.productTitle ?? subscription?.productTitle,
        snap?.variantTitle ?? subscription?.variantTitle,
      ]
        .filter(Boolean)
        .join(' — ');
      return {
        variantId,
        title: title || 'Product details unavailable',
        handle: snap?.productHandle ?? null,
        imageUrl: snap?.imageUrl ?? null,
        price: snap?.price ?? null,
        waiting: counts.email + counts.sms,
        emailWaiting: counts.email,
        smsWaiting: counts.sms,
        available: snap?.available ?? null,
        inStock: snap?.inStock ?? false,
        productUrl: storefrontProductUrl(shop, snap?.productHandle),
      };
    })
    .sort((a, b) => b.waiting - a.waiting);

  const totalWaiting = rows.reduce((acc, r) => acc + r.waiting, 0);

  return { shop, rows, totalWaiting };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();
  const intent = String(form.get('intent') ?? '');

  if (intent === 'sync') {
    // Pull live availability for every waitlisted variant and auto-flush any
    // that are back in stock. This is the manual fallback when webhooks aren't
    // wired (local dev) or to reconcile after downtime.
    const result = await syncWaitlistedVariants(admin, shop);
    return json({
      ok: true,
      message: `Synced ${result.synced} variant(s); sent ${result.alertsSent} alert(s).`,
    });
  }

  if (intent === 'flush') {
    const variantId = String(form.get('variantId') ?? '');
    if (!variantId) return json({ ok: false, message: 'Missing variant.' }, { status: 400 });
    const result = await flushVariant(shop, variantId);
    return json({
      ok: true,
      message:
        result.sent > 0
          ? `Sent ${result.sent} alert(s) for this variant.`
          : 'No alerts sent — no eligible subscribers (or alerts are disabled).',
    });
  }

  return json({ ok: false, message: 'Unknown action.' }, { status: 400 });
};

export default function DemandReport() {
  const { rows, totalWaiting } = useLoaderData<typeof loader>();
  const embeddedRoute = useEmbeddedRoute();
  const data = useActionData<typeof action>();
  const nav = useNavigation();
  const { smUp } = useBreakpoints();
  const busy = nav.state !== 'idle';
  const syncing = busy && nav.formData?.get('intent') === 'sync';

  return (
    <Page
      title="Demand report"
      subtitle="Sold-out variants ranked by how many shoppers are waiting."
      backAction={{ url: embeddedRoute('/app') }}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <InlineStack align="space-between" blockAlign="center" gap="300">
              <Text as="p" variant="bodyMd" tone="subdued">
                Restocks fire alerts automatically via webhook. Use “Check stock now”
                to reconcile against the Admin API on demand.
              </Text>
              <Form method="post" action={embeddedRoute('/app/demand')}>
                <input type="hidden" name="intent" value="sync" />
                <Button submit variant="primary" loading={syncing}>
                  Check stock now
                </Button>
              </Form>
            </InlineStack>
          </Card>
        </Layout.Section>

        {data?.message && (
          <Layout.Section>
            <Card>
              <Text as="p" tone={data.ok ? 'success' : 'critical'}>{data.message}</Text>
            </Card>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card padding="0">
            {rows.length === 0 ? (
              <EmptyState
                heading="No demand captured yet"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>
                  Once shoppers tap “Notify me” on a sold-out variant, the most-wanted
                  products surface here — so you know exactly what to restock first.
                </p>
              </EmptyState>
            ) : (
              <IndexTable
                condensed={!smUp}
                resourceName={{ singular: 'variant', plural: 'variants' }}
                itemCount={rows.length}
                selectable={false}
                headings={[
                  { title: 'Product' },
                  { title: 'Waiting' },
                  { title: 'Channels' },
                  { title: 'Stock' },
                  { title: '' },
                ]}
              >
                {rows.map((row, index) => (
                  <IndexTable.Row id={row.variantId} key={row.variantId} position={index}>
                    <IndexTable.Cell>
                      <BlockStack gap="050">
                        <Text as="span" variant="bodyMd" fontWeight="semibold">{row.title}</Text>
                        {row.price && (
                          <Text as="span" variant="bodySm" tone="subdued">{row.price}</Text>
                        )}
                      </BlockStack>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Text as="span" variant="bodyMd" fontWeight="bold">{String(row.waiting)}</Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <InlineStack gap="150">
                        <Text as="span" variant="bodySm" tone="subdued">{row.emailWaiting} email</Text>
                        <Text as="span" variant="bodySm" tone="subdued">{row.smsWaiting} SMS</Text>
                      </InlineStack>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      {row.inStock ? (
                        <Badge tone="success">{`In stock${row.available != null ? ` · ${row.available}` : ''}`}</Badge>
                      ) : (
                        <Badge tone="critical">Sold out</Badge>
                      )}
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Form method="post" action={embeddedRoute('/app/demand')}>
                        <input type="hidden" name="intent" value="flush" />
                        <input type="hidden" name="variantId" value={row.variantId} />
                        <Button submit size="slim" disabled={!row.inStock} variant="plain">
                          Notify now
                        </Button>
                      </Form>
                    </IndexTable.Cell>
                  </IndexTable.Row>
                ))}
              </IndexTable>
            )}
          </Card>
        </Layout.Section>

        {rows.length > 0 && (
          <Layout.Section>
            <Card>
              <Text as="p" tone="subdued">
                {totalWaiting} shopper{totalWaiting === 1 ? '' : 's'} waiting across{' '}
                {rows.length} variant{rows.length === 1 ? '' : 's'}. “Notify now” is
                enabled once a variant is back in stock; restocks also fire alerts
                automatically via the inventory webhook.
              </Text>
            </Card>
          </Layout.Section>
        )}
      </Layout>
    </Page>
  );
}
