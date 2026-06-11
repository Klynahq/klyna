import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/node';
import { useLoaderData, useNavigation, useSubmit } from '@remix-run/react';
import {
  Badge,
  BlockStack,
  Card,
  EmptyState,
  IndexTable,
  InlineStack,
  Layout,
  Page,
  Text,
} from '@shopify/polaris';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';
import { syncSubscriberToShopify } from '../lib/customer-sync.server';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const [subscribers, pendingCount] = await Promise.all([
    prisma.subscriber.findMany({
      where: { shop },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { popup: { select: { name: true } } },
    }),
    prisma.subscriber.count({ where: { shop, syncState: { in: ['pending', 'error'] } } }),
  ]);

  return {
    pendingCount,
    subscribers: subscribers.map((s) => ({
      id: s.id,
      email: s.email,
      phone: s.phone,
      popupName: s.popup?.name ?? '—',
      syncState: s.syncState,
      emailConsent: s.emailConsent,
      smsConsent: s.smsConsent,
      createdAt: s.createdAt.toISOString(),
    })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();
  const intent = String(form.get('intent') ?? '');

  if (intent === 'retry-sync') {
    // Re-attempt every subscriber that hasn't landed in Shopify yet.
    const pending = await prisma.subscriber.findMany({
      where: { shop, syncState: { in: ['pending', 'error'] } },
      take: 50,
    });

    let synced = 0;
    let failed = 0;
    for (const sub of pending) {
      const result = await syncSubscriberToShopify(admin, {
        email: sub.email,
        phone: sub.phone,
        emailConsent: sub.emailConsent,
        smsConsent: sub.smsConsent,
      });
      await prisma.subscriber.update({
        where: { id: sub.id },
        data: {
          syncState: result.state,
          shopifyCustomerId: result.customerId ?? sub.shopifyCustomerId,
          syncError: result.error ?? null,
        },
      });
      if (result.state === 'synced') synced += 1;
      else failed += 1;
    }

    return json({ ok: true, synced, failed });
  }

  return json({ ok: false }, { status: 400 });
};

export default function Subscribers() {
  const { subscribers, pendingCount } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const nav = useNavigation();
  const retrying = nav.formData?.get('intent') === 'retry-sync';

  const retry = () => submit({ intent: 'retry-sync' }, { method: 'post' });

  const syncTone = (s: string) =>
    s === 'synced' ? 'success' : s === 'error' ? 'critical' : 'attention';

  if (subscribers.length === 0) {
    return (
      <Page title="Subscribers">
        <Layout>
          <Layout.Section>
            <Card>
              <EmptyState
                heading="No subscribers yet"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>
                  Once a visitor opts in through one of your popups, the contact
                  shows up here and is written to Shopify customers with marketing
                  consent.
                </p>
              </EmptyState>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  return (
    <Page
      title="Subscribers"
      subtitle={`${subscribers.length} most recent`}
      primaryAction={
        pendingCount > 0
          ? { content: `Retry sync (${pendingCount})`, onAction: retry, loading: retrying }
          : undefined
      }
    >
      <Layout>
        <Layout.Section>
          <Card padding="0">
            <IndexTable
              resourceName={{ singular: 'subscriber', plural: 'subscribers' }}
              itemCount={subscribers.length}
              selectable={false}
              headings={[
                { title: 'Contact' },
                { title: 'Consent' },
                { title: 'Popup' },
                { title: 'Shopify sync' },
                { title: 'Captured' },
              ]}
            >
              {subscribers.map((s, index) => (
                <IndexTable.Row id={s.id} key={s.id} position={index}>
                  <IndexTable.Cell>
                    <BlockStack gap="050">
                      {s.email && <Text as="span">{s.email}</Text>}
                      {s.phone && <Text as="span" tone="subdued" variant="bodySm">{s.phone}</Text>}
                    </BlockStack>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <InlineStack gap="100">
                      {s.emailConsent && <Badge tone="info">Email</Badge>}
                      {s.smsConsent && <Badge tone="info">SMS</Badge>}
                    </InlineStack>
                  </IndexTable.Cell>
                  <IndexTable.Cell>{s.popupName}</IndexTable.Cell>
                  <IndexTable.Cell>
                    <Badge tone={syncTone(s.syncState)}>{s.syncState}</Badge>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    {new Date(s.createdAt).toLocaleString()}
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
