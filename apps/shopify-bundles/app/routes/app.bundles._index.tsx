import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/node';
import { useFetcher, useLoaderData } from '@remix-run/react';
import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  EmptyState,
  InlineStack,
  Layout,
  Page,
  ResourceItem,
  ResourceList,
  Text,
} from '@shopify/polaris';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';
import { quoteBundle, type DiscountType } from '../lib/pricing';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const bundles = await prisma.bundle.findMany({
    where: { shop: session.shop },
    orderBy: { updatedAt: 'desc' },
    include: { items: true },
  });

  // Compute each bundle's quoted total so the list shows real savings.
  const rows = bundles.map((b) => {
    const items = b.items.map((it) => ({ price: it.price, quantity: it.quantity }));
    const quote = quoteBundle(items, b.discountType as DiscountType, b.discountValue);
    return {
      id: b.id,
      title: b.title,
      kind: b.kind,
      status: b.status,
      itemCount: b.items.length,
      subtotal: quote.subtotal,
      total: quote.total,
      savingsPercent: quote.savingsPercent,
    };
  });

  return { rows };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const id = String(form.get('id') ?? '');
  const intent = String(form.get('intent') ?? '');

  const bundle = await prisma.bundle.findFirst({ where: { id, shop: session.shop } });
  if (!bundle) return json({ ok: false, error: 'Bundle not found' }, { status: 404 });

  if (intent === 'delete') {
    await prisma.bundle.delete({ where: { id } });
    return json({ ok: true });
  }
  if (intent === 'toggle') {
    const next = bundle.status === 'active' ? 'paused' : 'active';
    await prisma.bundle.update({ where: { id }, data: { status: next } });
    return json({ ok: true });
  }
  return json({ ok: false, error: 'Unknown intent' }, { status: 400 });
};

function statusTone(s: string) {
  return s === 'active' ? 'success' : s === 'paused' ? 'attention' : 'new';
}

export default function BundlesIndex() {
  const { rows } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();

  if (rows.length === 0) {
    return (
      <Page title="Bundles" primaryAction={{ content: 'New bundle', url: '/app/bundles/new' }}>
        <Layout>
          <Layout.Section>
            <Card>
              <EmptyState
                heading="Build your first bundle"
                action={{ content: 'New bundle', url: '/app/bundles/new' }}
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>
                  Group products into a fixed set or a mix-and-match offer, apply a
                  discount, and show the savings on the product page. Bundles lift
                  average order value by turning one item into several.
                </p>
              </EmptyState>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  return (
    <Page title="Bundles" primaryAction={{ content: 'New bundle', url: '/app/bundles/new' }}>
      <Layout>
        <Layout.Section>
          <Card padding="0">
            <ResourceList
              resourceName={{ singular: 'bundle', plural: 'bundles' }}
              items={rows}
              renderItem={(b) => (
                <ResourceItem
                  id={b.id}
                  url={`/app/bundles/${b.id}`}
                  accessibilityLabel={`Edit ${b.title}`}
                >
                  <InlineStack align="space-between" blockAlign="center" wrap={false}>
                    <BlockStack gap="100">
                      <InlineStack gap="200" blockAlign="center">
                        <Text as="span" variant="bodyMd" fontWeight="semibold">{b.title}</Text>
                        <Badge tone={statusTone(b.status)}>{b.status}</Badge>
                        <Badge>{b.kind === 'fixed' ? 'Fixed set' : 'Mix & match'}</Badge>
                      </InlineStack>
                      <Text as="span" variant="bodySm" tone="subdued">
                        {b.itemCount} {b.itemCount === 1 ? 'product' : 'products'}
                        {b.savingsPercent > 0 ? ` · Save ${b.savingsPercent}%` : ''}
                      </Text>
                    </BlockStack>
                    <Box>
                      <InlineStack gap="200" blockAlign="center">
                        <Text as="span" variant="bodyMd" tone="subdued">
                          <s>{b.subtotal.toFixed(2)}</s>
                        </Text>
                        <Text as="span" variant="bodyMd" fontWeight="semibold">
                          {b.total.toFixed(2)}
                        </Text>
                        <fetcher.Form method="post">
                          <input type="hidden" name="id" value={b.id} />
                          <Button
                            size="slim"
                            submit
                            name="intent"
                            value="toggle"
                            variant="tertiary"
                          >
                            {b.status === 'active' ? 'Pause' : 'Activate'}
                          </Button>
                        </fetcher.Form>
                      </InlineStack>
                    </Box>
                  </InlineStack>
                </ResourceItem>
              )}
            />
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
