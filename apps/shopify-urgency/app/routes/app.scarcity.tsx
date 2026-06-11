import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/node';
import { useState } from 'react';
import { useActionData, useLoaderData, useNavigation, useSubmit } from '@remix-run/react';
import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  EmptyState,
  Form as PolarisForm,
  FormLayout,
  InlineStack,
  Layout,
  Page,
  Select,
  Text,
  TextField,
} from '@shopify/polaris';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';

type ProductOption = { gid: string; title: string; totalInventory: number };

type ScarcityRow = {
  id: string;
  name: string;
  productGid: string;
  productTitle: string;
  threshold: number;
  template: string;
  hideAtOrBelow: number;
  accentColor: string;
  enabled: boolean;
  lastKnownQty: number | null;
};

// Pull up to 50 products with their tracked inventory so the merchant can pick
// which ones get a scarcity badge.
const PRODUCTS_QUERY = `#graphql
  query KlynaScarcityProducts {
    products(first: 50, sortKey: TITLE) {
      nodes {
        id
        title
        totalInventory
      }
    }
  }
`;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  let products: ProductOption[] = [];
  try {
    const res = await admin.graphql(PRODUCTS_QUERY);
    const body = await res.json();
    products =
      body?.data?.products?.nodes?.map((n: { id: string; title: string; totalInventory: number }) => ({
        gid: n.id,
        title: n.title,
        totalInventory: n.totalInventory ?? 0,
      })) ?? [];
  } catch (err) {
    console.error('Klyna Urgency: product fetch failed', err);
  }

  const rules = await prisma.scarcityRule.findMany({
    where: { shop },
    orderBy: { createdAt: 'desc' },
  });

  const rows: ScarcityRow[] = rules.map((r) => ({
    id: r.id,
    name: r.name,
    productGid: r.productGid,
    productTitle: r.productTitle,
    threshold: r.threshold,
    template: r.template,
    hideAtOrBelow: r.hideAtOrBelow,
    accentColor: r.accentColor,
    enabled: r.enabled,
    lastKnownQty: r.lastKnownQty,
  }));

  return { shop, products, rules: rows };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();
  const intent = String(form.get('intent') ?? '');

  if (intent === 'delete') {
    const id = String(form.get('id') ?? '');
    await prisma.scarcityRule.deleteMany({ where: { id, shop } });
    return json({ ok: true, message: 'Rule deleted.' });
  }

  if (intent === 'toggle') {
    const id = String(form.get('id') ?? '');
    const enabled = String(form.get('enabled') ?? '') === 'true';
    await prisma.scarcityRule.updateMany({ where: { id, shop }, data: { enabled } });
    return json({ ok: true, message: enabled ? 'Rule enabled.' : 'Rule disabled.' });
  }

  // Create / update a rule. We resolve the product title + live inventory from
  // the Admin API so the rule table reflects current stock.
  const productGid = String(form.get('productGid') ?? '');
  let productTitle = '';
  let lastKnownQty: number | null = null;

  if (productGid) {
    try {
      const res = await admin.graphql(
        `#graphql
          query KlynaProduct($id: ID!) {
            product(id: $id) { title totalInventory }
          }
        `,
        { variables: { id: productGid } },
      );
      const body = await res.json();
      productTitle = body?.data?.product?.title ?? '';
      lastKnownQty = body?.data?.product?.totalInventory ?? null;
    } catch (err) {
      console.error('Klyna Urgency: product resolve failed', err);
    }
  }

  const data = {
    shop,
    name: String(form.get('name') ?? 'Scarcity rule').slice(0, 120),
    productGid,
    productTitle,
    threshold: Math.max(1, Number(form.get('threshold') ?? 10) || 10),
    template: String(form.get('template') ?? 'Only {count} left in stock!').slice(0, 200),
    hideAtOrBelow: Math.max(0, Number(form.get('hideAtOrBelow') ?? 0) || 0),
    accentColor: String(form.get('accentColor') ?? '#fbbf24'),
    lastKnownQty,
    syncedAt: new Date(),
  };

  const id = String(form.get('id') ?? '');
  if (id) {
    await prisma.scarcityRule.updateMany({ where: { id, shop }, data });
    return json({ ok: true, message: 'Rule updated.' });
  }
  await prisma.scarcityRule.create({ data: { ...data, enabled: true } });
  return json({ ok: true, message: 'Rule created.' });
};

function blankRule(): ScarcityRow {
  return {
    id: '',
    name: '',
    productGid: '',
    productTitle: '',
    threshold: 10,
    template: 'Only {count} left in stock!',
    hideAtOrBelow: 0,
    accentColor: '#fbbf24',
    enabled: true,
    lastKnownQty: null,
  };
}

export default function Scarcity() {
  const { products, rules } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const submit = useSubmit();
  const submitting = nav.state === 'submitting';

  const [editing, setEditing] = useState<ScarcityRow | null>(null);

  return (
    <Page
      title="Stock scarcity"
      backAction={{ url: '/app' }}
      primaryAction={{ content: 'New rule', onAction: () => setEditing(blankRule()) }}
    >
      <Layout>
        {actionData?.message && (
          <Layout.Section>
            <Card>
              <Text as="p" tone={actionData.ok ? 'success' : 'critical'}>{actionData.message}</Text>
            </Card>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">How scarcity works</Text>
              <Text as="p" tone="subdued">
                Each rule maps to one product (or all products). When live inventory
                falls at or below your threshold, the storefront badge shows your
                template with <code>{'{count}'}</code> replaced by the real quantity.
                Inventory is read straight from Shopify — no manual updates.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>

        {editing && (
          <Layout.Section>
            <ScarcityEditor
              key={editing.id || 'new'}
              rule={editing}
              products={products}
              submitting={submitting}
              onCancel={() => setEditing(null)}
            />
          </Layout.Section>
        )}

        <Layout.Section>
          {rules.length === 0 && !editing ? (
            <Card>
              <EmptyState
                heading="No scarcity rules yet"
                action={{ content: 'New rule', onAction: () => setEditing(blankRule()) }}
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>Create a rule, pick a product and threshold, then add the Klyna
                  Urgency scarcity block to your product template.</p>
              </EmptyState>
            </Card>
          ) : (
            <BlockStack gap="300">
              {rules.map((r) => {
                const live = r.lastKnownQty;
                const showing = live !== null && live <= r.threshold && live > r.hideAtOrBelow;
                return (
                  <Card key={r.id}>
                    <BlockStack gap="200">
                      <InlineStack align="space-between" blockAlign="center">
                        <InlineStack gap="200" blockAlign="center">
                          <Text as="h3" variant="headingSm">{r.name || 'Scarcity rule'}</Text>
                          <Badge tone={r.enabled ? 'success' : undefined}>
                            {r.enabled ? 'Active' : 'Paused'}
                          </Badge>
                          {r.enabled && (
                            <Badge tone={showing ? 'attention' : undefined}>
                              {showing ? 'Showing now' : 'Above threshold'}
                            </Badge>
                          )}
                        </InlineStack>
                        <InlineStack gap="200">
                          <Button onClick={() => setEditing(r)}>Edit</Button>
                          <Button
                            onClick={() =>
                              submit(
                                { intent: 'toggle', id: r.id, enabled: String(!r.enabled) },
                                { method: 'post' },
                              )
                            }
                          >
                            {r.enabled ? 'Pause' : 'Enable'}
                          </Button>
                          <Button
                            variant="primary"
                            tone="critical"
                            onClick={() => {
                              if (confirm('Delete this rule?')) {
                                submit({ intent: 'delete', id: r.id }, { method: 'post' });
                              }
                            }}
                          >
                            Delete
                          </Button>
                        </InlineStack>
                      </InlineStack>

                      <Text as="p" variant="bodyMd">
                        {r.template.replace('{count}', String(live ?? r.threshold))}
                      </Text>
                      <InlineStack gap="400">
                        <Detail label="Product" value={r.productTitle || 'All products'} />
                        <Detail label="Threshold" value={`≤ ${r.threshold}`} />
                        <Detail label="Hide at/below" value={String(r.hideAtOrBelow)} />
                        <Detail
                          label="Live inventory"
                          value={live === null ? '—' : String(live)}
                        />
                      </InlineStack>
                    </BlockStack>
                  </Card>
                );
              })}
            </BlockStack>
          )}
        </Layout.Section>
      </Layout>
    </Page>
  );
}

function ScarcityEditor({
  rule,
  products,
  submitting,
  onCancel,
}: {
  rule: ScarcityRow;
  products: ProductOption[];
  submitting: boolean;
  onCancel: () => void;
}) {
  const [productGid, setProductGid] = useState(rule.productGid);
  const [name, setName] = useState(rule.name);
  const [threshold, setThreshold] = useState(String(rule.threshold));
  const [hideAtOrBelow, setHideAtOrBelow] = useState(String(rule.hideAtOrBelow));
  const [template, setTemplate] = useState(rule.template);

  const productOptions = [
    { label: 'All products', value: '' },
    ...products.map((p) => ({
      label: `${p.title} (stock: ${p.totalInventory})`,
      value: p.gid,
    })),
  ];

  return (
    <Card>
      <BlockStack gap="300">
        <Text as="h2" variant="headingMd">{rule.id ? 'Edit rule' : 'New rule'}</Text>
        <PolarisForm method="post" onSubmit={() => undefined}>
          <input type="hidden" name="intent" value="save" />
          {rule.id && <input type="hidden" name="id" value={rule.id} />}
          <input type="hidden" name="productGid" value={productGid} />
          <input type="hidden" name="name" value={name} />
          <input type="hidden" name="threshold" value={threshold} />
          <input type="hidden" name="hideAtOrBelow" value={hideAtOrBelow} />
          <input type="hidden" name="template" value={template} />
          <FormLayout>
            <TextField
              label="Internal name"
              value={name}
              onChange={setName}
              autoComplete="off"
            />
            <Select
              label="Product"
              options={productOptions}
              value={productGid}
              onChange={setProductGid}
              helpText="Choose a specific product or apply to every product."
            />
            <FormLayout.Group>
              <TextField
                label="Show when stock is at or below"
                type="number"
                min={1}
                value={threshold}
                onChange={setThreshold}
                autoComplete="off"
              />
              <TextField
                label="But hide if at or below"
                type="number"
                min={0}
                value={hideAtOrBelow}
                onChange={setHideAtOrBelow}
                autoComplete="off"
                helpText='Avoid alarming "Only 1 left" messages.'
              />
            </FormLayout.Group>
            <TextField
              label="Badge template"
              value={template}
              onChange={setTemplate}
              autoComplete="off"
              helpText="Use {count} for the live quantity."
            />
            <ColorField
              label="Accent color"
              name="accentColor"
              defaultValue={rule.accentColor}
            />
            <InlineStack gap="200">
              <Button submit variant="primary" loading={submitting}>
                {rule.id ? 'Save changes' : 'Create rule'}
              </Button>
              <Button onClick={onCancel}>Cancel</Button>
            </InlineStack>
          </FormLayout>
        </PolarisForm>
      </BlockStack>
    </Card>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <BlockStack gap="050">
      <Text as="span" variant="bodySm" tone="subdued">{label}</Text>
      <Text as="span" variant="bodyMd">{value}</Text>
    </BlockStack>
  );
}

function ColorField({
  label,
  name,
  defaultValue,
}: {
  label: string;
  name: string;
  defaultValue: string;
}) {
  return (
    <Box>
      <Text as="span" variant="bodySm" tone="subdued">{label}</Text>
      <input
        type="color"
        name={name}
        defaultValue={defaultValue}
        style={{
          width: '100%',
          height: 36,
          padding: 2,
          borderRadius: 8,
          border: '1px solid var(--p-color-border)',
          background: 'var(--p-color-bg-surface)',
        }}
      />
    </Box>
  );
}
