import { type ActionFunctionArgs, type LoaderFunctionArgs, json, redirect } from '@remix-run/node';
import { Link, useLoaderData, useNavigation, useSubmit } from '@remix-run/react';
import {
  BlockStack,
  Badge,
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
import { FORMAT_LABELS, type PopupFormat, conversionRate } from '../lib/popups';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const popups = await prisma.popup.findMany({
    where: { shop },
    orderBy: { updatedAt: 'desc' },
  });

  // Pull per-popup impression/conversion counts in one grouped query each.
  const [impressionGroups, conversionGroups, subscriberGroups] = await Promise.all([
    prisma.popupEvent.groupBy({
      by: ['popupId'],
      where: { shop, type: 'impression' },
      _count: { _all: true },
    }),
    prisma.popupEvent.groupBy({
      by: ['popupId'],
      where: { shop, type: 'conversion' },
      _count: { _all: true },
    }),
    prisma.subscriber.groupBy({
      by: ['popupId'],
      where: { shop },
      _count: { _all: true },
    }),
  ]);

  const impressionsBy = Object.fromEntries(
    impressionGroups.map((g) => [g.popupId, g._count._all]),
  );
  const conversionsBy = Object.fromEntries(
    conversionGroups.map((g) => [g.popupId, g._count._all]),
  );
  const subscribersBy = Object.fromEntries(
    subscriberGroups.map((g) => [g.popupId, g._count._all]),
  );

  return {
    popups: popups.map((p) => {
      const impressions = impressionsBy[p.id] ?? 0;
      const conversions = conversionsBy[p.id] ?? 0;
      return {
        id: p.id,
        name: p.name,
        format: p.format,
        status: p.status,
        impressions,
        conversions,
        subscribers: subscribersBy[p.id] ?? 0,
        rate: conversionRate(conversions, impressions),
      };
    }),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();
  const intent = String(form.get('intent') ?? '');

  if (intent === 'create') {
    // Seed the accent color from the store's brand color when available.
    let accent = '#7c5cff';
    try {
      const res = await admin.graphql(`#graphql
        query KlynaBrandColor {
          shop {
            brand {
              colors {
                primary { background foreground }
              }
            }
          }
        }
      `);
      const body = (await res.json()) as {
        data?: { shop?: { brand?: { colors?: { primary?: Array<{ background?: string }> } } } };
      };
      const primary = body.data?.shop?.brand?.colors?.primary?.[0]?.background;
      if (primary && /^#[0-9a-fA-F]{6}$/.test(primary)) accent = primary;
    } catch {
      // Non-fatal — fall back to the Klyna accent.
    }

    const popup = await prisma.popup.create({
      data: { shop, name: 'Untitled popup', accentColor: accent },
    });
    return redirect(`/app/popups/${popup.id}`);
  }

  if (intent === 'delete') {
    const ids = form.getAll('ids').map(String);
    if (ids.length > 0) {
      await prisma.popup.deleteMany({ where: { shop, id: { in: ids } } });
    }
    return json({ ok: true });
  }

  return json({ ok: false }, { status: 400 });
};

export default function PopupsIndex() {
  const { popups } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const nav = useNavigation();
  const creating =
    nav.state !== 'idle' && nav.formData?.get('intent') === 'create';

  const resourceName = { singular: 'popup', plural: 'popups' };
  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(popups);

  const create = () => submit({ intent: 'create' }, { method: 'post' });
  const removeSelected = () => {
    const fd = new FormData();
    fd.set('intent', 'delete');
    selectedResources.forEach((id) => fd.append('ids', id));
    submit(fd, { method: 'post' });
  };

  const statusTone = (s: string) =>
    s === 'active' ? 'success' : s === 'paused' ? 'attention' : 'new';

  if (popups.length === 0) {
    return (
      <Page
        title="Popups"
        primaryAction={{ content: 'Create popup', onAction: create, loading: creating }}
      >
        <Layout>
          <Layout.Section>
            <Card>
              <EmptyState
                heading="Build your first list-growth popup"
                action={{ content: 'Create popup', onAction: create, loading: creating }}
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>
                  Choose email, SMS, or a spin-to-win wheel. Add exit-intent,
                  scroll, or time triggers and target by page, device, or new vs
                  returning visitors. Opt-ins sync to Shopify customers with
                  marketing consent automatically.
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
      title="Popups"
      subtitle={`${popups.length} campaign${popups.length === 1 ? '' : 's'}`}
      primaryAction={{ content: 'Create popup', onAction: create, loading: creating }}
    >
      <Layout>
        <Layout.Section>
          <Card padding="0">
            {selectedResources.length > 0 && (
              <div style={{ padding: '12px 16px' }}>
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="span" variant="bodySm" tone="subdued">
                    {selectedResources.length} selected
                  </Text>
                  <Button tone="critical" variant="plain" onClick={removeSelected}>
                    Delete
                  </Button>
                </InlineStack>
              </div>
            )}
            <IndexTable
              resourceName={resourceName}
              itemCount={popups.length}
              selectedItemsCount={allResourcesSelected ? 'All' : selectedResources.length}
              onSelectionChange={handleSelectionChange}
              headings={[
                { title: 'Name' },
                { title: 'Format' },
                { title: 'Status' },
                { title: 'Subscribers' },
                { title: 'Impressions' },
                { title: 'Conv. rate' },
              ]}
            >
              {popups.map((p, index) => (
                <IndexTable.Row
                  id={p.id}
                  key={p.id}
                  position={index}
                  selected={selectedResources.includes(p.id)}
                >
                  <IndexTable.Cell>
                    <Link to={`/app/popups/${p.id}`}>
                      <Text as="span" fontWeight="semibold">{p.name}</Text>
                    </Link>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    {FORMAT_LABELS[p.format as PopupFormat] ?? p.format}
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Badge tone={statusTone(p.status)}>{p.status}</Badge>
                  </IndexTable.Cell>
                  <IndexTable.Cell>{p.subscribers.toLocaleString()}</IndexTable.Cell>
                  <IndexTable.Cell>{p.impressions.toLocaleString()}</IndexTable.Cell>
                  <IndexTable.Cell>{`${p.rate}%`}</IndexTable.Cell>
                </IndexTable.Row>
              ))}
            </IndexTable>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text as="h3" variant="headingSm">Showing on the storefront</Text>
              <Text as="p" tone="subdued">
                Popups only render once the Klyna Capture app embed is enabled in
                your theme. Open <b>Online Store → Themes → Customize → App
                embeds</b> and toggle <b>Klyna Capture</b> on.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
