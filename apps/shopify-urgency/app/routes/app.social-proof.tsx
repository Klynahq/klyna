import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/node';
import { useState } from 'react';
import { useActionData, useLoaderData, useNavigation, useSubmit } from '@remix-run/react';
import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  Divider,
  FormLayout,
  InlineStack,
  Layout,
  List,
  Page,
  Select,
  Text,
  TextField,
} from '@shopify/polaris';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';

// Recent orders → privacy-reduced proof events. We only persist first name and
// city: enough for "Sarah from Austin just bought …", nothing more.
const ORDERS_QUERY = `#graphql
  query KlynaRecentOrders {
    orders(first: 50, sortKey: CREATED_AT, reverse: true, query: "financial_status:paid") {
      nodes {
        id
        createdAt
        customer { firstName }
        shippingAddress { city }
        billingAddress { city }
        lineItems(first: 1) { nodes { title } }
      }
    }
  }
`;

type ConfigShape = {
  enabled: boolean;
  source: string;
  template: string;
  position: string;
  displaySeconds: number;
  intervalSeconds: number;
  maxAgeHours: number;
  accentColor: string;
};

function defaults(): ConfigShape {
  return {
    enabled: false,
    source: 'real',
    template: '{name} from {city} just bought {product}',
    position: 'bottom-left',
    displaySeconds: 5,
    intervalSeconds: 12,
    maxAgeHours: 168,
    accentColor: '#7c5cff',
  };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const cfg = await prisma.socialProofConfig.findUnique({ where: { shop } });
  const [recent, syncedCount] = await Promise.all([
    prisma.proofEvent.findMany({
      where: { shop },
      orderBy: { purchasedAt: 'desc' },
      take: 8,
    }),
    prisma.proofEvent.count({ where: { shop } }),
  ]);

  return {
    shop,
    config: cfg
      ? {
          enabled: cfg.enabled,
          source: cfg.source,
          template: cfg.template,
          position: cfg.position,
          displaySeconds: cfg.displaySeconds,
          intervalSeconds: cfg.intervalSeconds,
          maxAgeHours: cfg.maxAgeHours,
          accentColor: cfg.accentColor,
        }
      : defaults(),
    recent: recent.map((e) => ({
      id: e.id,
      firstName: e.firstName,
      city: e.city,
      productTitle: e.productTitle,
      purchasedAt: e.purchasedAt.toISOString(),
    })),
    syncedCount,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();
  const intent = String(form.get('intent') ?? '');

  if (intent === 'sync') {
    // Pull recent paid orders, reduce to {firstName, city, product}, upsert.
    let synced = 0;
    try {
      const res = await admin.graphql(ORDERS_QUERY);
      const body = await res.json();
      const nodes: Array<{
        id: string;
        createdAt: string;
        customer?: { firstName?: string | null } | null;
        shippingAddress?: { city?: string | null } | null;
        billingAddress?: { city?: string | null } | null;
        lineItems: { nodes: Array<{ title: string }> };
      }> = body?.data?.orders?.nodes ?? [];

      for (const o of nodes) {
        const firstName = (o.customer?.firstName ?? '').trim() || 'Someone';
        const city = (o.shippingAddress?.city ?? o.billingAddress?.city ?? '').trim() || 'somewhere';
        const productTitle = o.lineItems.nodes[0]?.title ?? 'an item';
        await prisma.proofEvent.upsert({
          where: { orderGid: o.id },
          create: {
            shop,
            firstName,
            city,
            productTitle,
            orderGid: o.id,
            purchasedAt: new Date(o.createdAt),
          },
          update: { firstName, city, productTitle },
        });
        synced += 1;
      }
    } catch (err) {
      console.error('Klyna Urgency: order sync failed', err);
      return json(
        { ok: false, message: 'Order sync failed. Check that read_orders is granted.' },
        { status: 500 },
      );
    }
    return json({ ok: true, message: `Synced ${synced} recent orders.` });
  }

  // Save config.
  const data = {
    shop,
    enabled: String(form.get('enabled') ?? '') === 'true',
    source: String(form.get('source') ?? 'real'),
    template: String(form.get('template') ?? '{name} from {city} just bought {product}').slice(0, 200),
    position: String(form.get('position') ?? 'bottom-left'),
    displaySeconds: clamp(Number(form.get('displaySeconds') ?? 5), 2, 30),
    intervalSeconds: clamp(Number(form.get('intervalSeconds') ?? 12), 4, 120),
    maxAgeHours: clamp(Number(form.get('maxAgeHours') ?? 168), 1, 8760),
    accentColor: String(form.get('accentColor') ?? '#7c5cff'),
  };

  await prisma.socialProofConfig.upsert({
    where: { shop },
    create: data,
    update: data,
  });
  return json({ ok: true, message: 'Social proof settings saved.' });
};

function clamp(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n)) return lo;
  return Math.min(hi, Math.max(lo, Math.round(n)));
}

export default function SocialProof() {
  const { config, recent, syncedCount } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const submit = useSubmit();
  const submitting = nav.state === 'submitting';

  const [enabled, setEnabled] = useState(config.enabled);
  const [source, setSource] = useState(config.source);
  const [position, setPosition] = useState(config.position);
  const [template, setTemplate] = useState(config.template);
  const [displaySeconds, setDisplaySeconds] = useState(String(config.displaySeconds));
  const [intervalSeconds, setIntervalSeconds] = useState(String(config.intervalSeconds));
  const [maxAgeHours, setMaxAgeHours] = useState(String(config.maxAgeHours));

  const previewName = recent[0]?.firstName ?? 'Sarah';
  const previewCity = recent[0]?.city ?? 'Austin';
  const previewProduct = recent[0]?.productTitle ?? 'the Aurora Hoodie';
  const previewText = config.template
    .replace('{name}', previewName)
    .replace('{city}', previewCity)
    .replace('{product}', previewProduct);

  return (
    <Page
      title="Social proof"
      backAction={{ url: '/app' }}
      primaryAction={{
        content: 'Sync recent orders',
        loading: submitting && nav.formData?.get('intent') === 'sync',
        onAction: () => submit({ intent: 'sync' }, { method: 'post' }),
      }}
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
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">Recently-purchased popups</Text>
                <Badge tone={enabled ? 'success' : undefined}>{enabled ? 'Live' : 'Off'}</Badge>
              </InlineStack>
              <Text as="p" tone="subdued">
                Show a rotating popup of real purchases. We reduce every order to a
                first name and city before it ever leaves your store — no full names,
                emails, or addresses are stored or displayed.
              </Text>
              <Box
                background="bg-surface-secondary"
                borderRadius="200"
                padding="300"
                borderColor="border"
                borderWidth="025"
              >
                <InlineStack gap="200" blockAlign="center">
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 999,
                      background: config.accentColor,
                      display: 'inline-block',
                    }}
                  />
                  <Text as="span" variant="bodyMd">{previewText}</Text>
                </InlineStack>
                <Box paddingBlockStart="100">
                  <Text as="span" variant="bodySm" tone="subdued">Preview</Text>
                </Box>
              </Box>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Settings</Text>
              <form
                method="post"
                onSubmit={(e) => {
                  e.preventDefault();
                  submit(e.currentTarget, { method: 'post' });
                }}
              >
                <input type="hidden" name="intent" value="save" />
                <input type="hidden" name="enabled" value={String(enabled)} />
                <input type="hidden" name="source" value={source} />
                <input type="hidden" name="position" value={position} />
                <input type="hidden" name="template" value={template} />
                <input type="hidden" name="displaySeconds" value={displaySeconds} />
                <input type="hidden" name="intervalSeconds" value={intervalSeconds} />
                <input type="hidden" name="maxAgeHours" value={maxAgeHours} />
                <FormLayout>
                  <Select
                    label="Status"
                    options={[
                      { label: 'On — show popups on the storefront', value: 'true' },
                      { label: 'Off', value: 'false' },
                    ]}
                    value={String(enabled)}
                    onChange={(v) => setEnabled(v === 'true')}
                  />
                  <Select
                    label="Source"
                    options={[
                      { label: 'Real orders (synced)', value: 'real' },
                      { label: 'Synthetic (curated rotation)', value: 'synthetic' },
                    ]}
                    value={source}
                    onChange={setSource}
                    helpText="Real uses your synced orders. Synthetic rotates a neutral demo pool — handy for new stores."
                  />
                  <TextField
                    label="Message template"
                    value={template}
                    onChange={setTemplate}
                    autoComplete="off"
                    helpText="Tokens: {name}, {city}, {product}."
                  />
                  <Select
                    label="Position"
                    options={[
                      { label: 'Bottom left', value: 'bottom-left' },
                      { label: 'Bottom right', value: 'bottom-right' },
                      { label: 'Top left', value: 'top-left' },
                      { label: 'Top right', value: 'top-right' },
                    ]}
                    value={position}
                    onChange={setPosition}
                  />
                  <FormLayout.Group>
                    <TextField
                      label="Seconds visible"
                      type="number"
                      min={2}
                      max={30}
                      value={displaySeconds}
                      onChange={setDisplaySeconds}
                      autoComplete="off"
                    />
                    <TextField
                      label="Seconds between popups"
                      type="number"
                      min={4}
                      max={120}
                      value={intervalSeconds}
                      onChange={setIntervalSeconds}
                      autoComplete="off"
                    />
                    <TextField
                      label="Max order age (hours)"
                      type="number"
                      min={1}
                      value={maxAgeHours}
                      onChange={setMaxAgeHours}
                      autoComplete="off"
                    />
                  </FormLayout.Group>
                  <ColorField
                    label="Accent color"
                    name="accentColor"
                    defaultValue={config.accentColor}
                  />
                  <Button submit variant="primary" loading={submitting && nav.formData?.get('intent') === 'save'}>
                    Save settings
                  </Button>
                </FormLayout>
              </form>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">Synced purchases</Text>
                <Text as="span" variant="bodySm" tone="subdued">{syncedCount} stored</Text>
              </InlineStack>
              <Divider />
              {recent.length === 0 ? (
                <Text as="p" tone="subdued">
                  No purchases synced yet. Click “Sync recent orders” above to pull
                  your latest paid orders.
                </Text>
              ) : (
                <List type="bullet">
                  {recent.map((e) => (
                    <List.Item key={e.id}>
                      <Text as="span" variant="bodyMd">
                        {e.firstName} from {e.city} — {e.productTitle}
                      </Text>{' '}
                      <Text as="span" variant="bodySm" tone="subdued">
                        · {new Date(e.purchasedAt).toLocaleString()}
                      </Text>
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
