import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/node';
import { Form, useActionData, useLoaderData, useNavigation } from '@remix-run/react';
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
  useIndexResourceState,
} from '@shopify/polaris';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';
import { makeRequestToken } from '../lib/reviews.server';

interface OrderLineItem {
  productId: string;
  productTitle: string;
}

interface FulfilledOrder {
  orderId: string;
  name: string;
  customerName: string | null;
  customerEmail: string | null;
  fulfilledAt: string | null;
  lineItems: OrderLineItem[];
}

const RECENT_FULFILLED_QUERY = `#graphql
  query RecentFulfilledOrders {
    orders(first: 25, query: "fulfillment_status:fulfilled", sortKey: PROCESSED_AT, reverse: true) {
      edges {
        node {
          id
          name
          processedAt
          displayFulfillmentStatus
          customer { firstName lastName }
          email
          fulfillments(first: 1) { createdAt }
          lineItems(first: 20) {
            edges { node { title product { id } } }
          }
        }
      }
    }
  }`;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);

  const response = await admin.graphql(RECENT_FULFILLED_QUERY);
  const payload = (await response.json()) as {
    data?: {
      orders?: {
        edges: {
          node: {
            id: string;
            name: string;
            processedAt: string;
            email: string | null;
            customer: { firstName: string | null; lastName: string | null } | null;
            fulfillments: { createdAt: string }[];
            lineItems: { edges: { node: { title: string; product: { id: string } | null } }[] };
          };
        }[];
      };
    };
  };

  const orders: FulfilledOrder[] = (payload.data?.orders?.edges ?? []).map((edge) => {
    const n = edge.node;
    const name = [n.customer?.firstName, n.customer?.lastName].filter(Boolean).join(' ') || null;
    return {
      orderId: n.id,
      name: n.name,
      customerName: name,
      customerEmail: n.email,
      fulfilledAt: n.fulfillments[0]?.createdAt ?? n.processedAt ?? null,
      lineItems: n.lineItems.edges
        .filter((e) => e.node.product)
        .map((e) => ({ productId: e.node.product!.id, productTitle: e.node.title })),
    };
  });

  const requests = await prisma.reviewRequest.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  const settings = await prisma.settings.findUnique({ where: { shop: session.shop } });

  return {
    orders,
    requests,
    requestDelayDays: settings?.requestDelayDays ?? 7,
    requestEnabled: settings?.requestEnabled ?? true,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get('intent') ?? '');

  if (intent === 'schedule') {
    const payload = JSON.parse(String(form.get('orders') ?? '[]')) as FulfilledOrder[];
    const settings = await prisma.settings.findUnique({ where: { shop: session.shop } });
    const delayDays = settings?.requestDelayDays ?? 7;

    let created = 0;
    for (const order of payload) {
      if (!order.customerEmail) continue;
      const base = order.fulfilledAt ? new Date(order.fulfilledAt) : new Date();
      const scheduledFor = new Date(base.getTime() + delayDays * 24 * 60 * 60 * 1000);

      for (const item of order.lineItems) {
        try {
          await prisma.reviewRequest.create({
            data: {
              shop: session.shop,
              orderId: order.orderId,
              productId: item.productId,
              productTitle: item.productTitle,
              customerEmail: order.customerEmail,
              customerName: order.customerName,
              token: makeRequestToken(),
              status: 'scheduled',
              scheduledFor,
            },
          });
          created += 1;
        } catch {
          // Unique (shop, orderId, productId) — already scheduled, skip silently.
        }
      }
    }
    return json({ ok: true, scheduled: created });
  }

  if (intent === 'send') {
    // Marks all due, scheduled requests as sent. In production this is where
    // the SMTP relay dispatches the templated email with the /r/:token link.
    const now = new Date();
    const due = await prisma.reviewRequest.findMany({
      where: { shop: session.shop, status: 'scheduled', scheduledFor: { lte: now } },
    });
    await prisma.reviewRequest.updateMany({
      where: { id: { in: due.map((d) => d.id) } },
      data: { status: 'sent', sentAt: now },
    });
    return json({ ok: true, sent: due.length });
  }

  if (intent === 'skip') {
    const id = String(form.get('id') ?? '');
    await prisma.reviewRequest.updateMany({
      where: { id, shop: session.shop },
      data: { status: 'skipped' },
    });
    return json({ ok: true });
  }

  return json({ error: 'Unknown action.' }, { status: 400 });
};

function requestTone(status: string): 'attention' | 'success' | 'info' | 'critical' {
  if (status === 'reviewed') return 'success';
  if (status === 'sent') return 'info';
  if (status === 'bounced') return 'critical';
  return 'attention';
}

export default function Requests() {
  const { orders, requests, requestDelayDays, requestEnabled } = useLoaderData<typeof loader>();
  const data = useActionData<typeof action>();
  const nav = useNavigation();
  const busy = nav.state !== 'idle';

  const eligible = orders.filter((o) => o.customerEmail && o.lineItems.length > 0);
  const resourceState = useIndexResourceState(
    eligible.map((o) => ({ id: o.orderId })),
  );
  const { selectedResources, allResourcesSelected, handleSelectionChange } = resourceState;

  const selectedOrders = eligible.filter((o) => selectedResources.includes(o.orderId));

  return (
    <Page
      title="Review requests"
      subtitle={`Ask verified buyers ${requestDelayDays} days after fulfillment`}
      backAction={{ url: '/app' }}
    >
      <Layout>
        {!requestEnabled && (
          <Layout.Section>
            <Card>
              <Text as="p" tone="caution">
                Automated requests are turned off. New fulfillments won’t be queued —
                turn them back on in Settings. You can still schedule manually below.
              </Text>
            </Card>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">Recent fulfilled orders</Text>
                <InlineStack gap="200">
                  <Form method="post">
                    <input type="hidden" name="intent" value="schedule" />
                    <input type="hidden" name="orders" value={JSON.stringify(selectedOrders)} />
                    <Button submit variant="primary" disabled={selectedOrders.length === 0} loading={busy}>
                      Schedule {String(selectedOrders.length || '')} request{selectedOrders.length === 1 ? '' : 's'}
                    </Button>
                  </Form>
                  <Form method="post">
                    <input type="hidden" name="intent" value="send" />
                    <Button submit loading={busy}>Send due now</Button>
                  </Form>
                </InlineStack>
              </InlineStack>

              {data && 'scheduled' in data && (
                <Text as="p" tone="success">Scheduled {String(data.scheduled)} request(s).</Text>
              )}
              {data && 'sent' in data && (
                <Text as="p" tone="success">Sent {String(data.sent)} due request(s).</Text>
              )}

              {eligible.length === 0 ? (
                <EmptyState
                  heading="No eligible fulfilled orders yet"
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>Orders with a fulfillment and a customer email will appear here.</p>
                </EmptyState>
              ) : (
                <IndexTable
                  resourceName={{ singular: 'order', plural: 'orders' }}
                  itemCount={eligible.length}
                  selectedItemsCount={allResourcesSelected ? 'All' : selectedResources.length}
                  onSelectionChange={handleSelectionChange}
                  headings={[
                    { title: 'Order' },
                    { title: 'Customer' },
                    { title: 'Email' },
                    { title: 'Products' },
                    { title: 'Fulfilled' },
                  ]}
                >
                  {eligible.map((o, index) => (
                    <IndexTable.Row
                      id={o.orderId}
                      key={o.orderId}
                      position={index}
                      selected={selectedResources.includes(o.orderId)}
                    >
                      <IndexTable.Cell>
                        <Text as="span" fontWeight="semibold">{o.name}</Text>
                      </IndexTable.Cell>
                      <IndexTable.Cell>{o.customerName ?? '—'}</IndexTable.Cell>
                      <IndexTable.Cell>{o.customerEmail}</IndexTable.Cell>
                      <IndexTable.Cell>{o.lineItems.length}</IndexTable.Cell>
                      <IndexTable.Cell>
                        {o.fulfilledAt ? new Date(o.fulfilledAt).toLocaleDateString() : '—'}
                      </IndexTable.Cell>
                    </IndexTable.Row>
                  ))}
                </IndexTable>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Request log</Text>
              {requests.length === 0 ? (
                <Text as="p" tone="subdued">No requests scheduled yet.</Text>
              ) : (
                <BlockStack gap="200">
                  {requests.map((r) => (
                    <Box
                      key={r.id}
                      padding="300"
                      borderColor="border"
                      borderWidth="025"
                      borderRadius="200"
                    >
                      <InlineStack align="space-between" blockAlign="center">
                        <BlockStack gap="050">
                          <Text as="span" fontWeight="semibold">{r.productTitle}</Text>
                          <Text as="span" variant="bodySm" tone="subdued">
                            {r.customerEmail} · scheduled {new Date(r.scheduledFor).toLocaleDateString()}
                          </Text>
                        </BlockStack>
                        <InlineStack gap="200" blockAlign="center">
                          <Badge tone={requestTone(r.status)}>{r.status}</Badge>
                          {(r.status === 'scheduled' || r.status === 'sent') && (
                            <Form method="post">
                              <input type="hidden" name="id" value={r.id} />
                              <input type="hidden" name="intent" value="skip" />
                              <Button submit variant="tertiary" size="slim">Skip</Button>
                            </Form>
                          )}
                        </InlineStack>
                      </InlineStack>
                    </Box>
                  ))}
                </BlockStack>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
