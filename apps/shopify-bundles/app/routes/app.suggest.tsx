// AI-suggested bundles. Generation is disabled in the default public-safe app
// configuration because order-history mining requires protected customer data
// approval. Existing suggestions can still be approved or dismissed.
import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/node';
import { useLoaderData, useNavigation, useSubmit } from '@remix-run/react';
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
  Text,
} from '@shopify/polaris';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';
import { getShopAiSettings } from '../lib/ai.server';

type Companion = { gid: string; title: string };

type SuggestionView = {
  id: string;
  anchorGid: string;
  anchorTitle: string;
  suggestedTitle: string;
  blurb: string;
  discountPct: number;
  companions: Companion[];
  createdAt: string;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const aiSettings = await getShopAiSettings(shop);

  const rows = await prisma.bundleSuggestion.findMany({
    where: { shop, status: 'pending' },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  const suggestions: SuggestionView[] = rows.map((r) => {
    let companions: Companion[] = [];
    try {
      const parsed = JSON.parse(r.companionsJson) as unknown;
      if (Array.isArray(parsed)) {
        companions = parsed
          .filter((c): c is { gid?: unknown; title?: unknown } => typeof c === 'object' && c !== null)
          .map((c) => ({
            gid: typeof c.gid === 'string' ? c.gid : '',
            title: typeof c.title === 'string' ? c.title : '',
          }))
          .filter((c) => c.gid && c.title);
      }
    } catch {
      companions = [];
    }
    return {
      id: r.id,
      anchorGid: r.anchorGid,
      anchorTitle: r.anchorTitle,
      suggestedTitle: r.suggestedTitle,
      blurb: r.blurb,
      discountPct: r.discountPct,
      companions,
      createdAt: r.createdAt.toISOString(),
    };
  });

  return {
    aiOff: aiSettings.provider === 'off',
    suggestions,
    orderHistoryEnabled: false,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();
  const intent = String(form.get('intent') ?? 'generate');

  if (intent === 'dismiss') {
    const id = String(form.get('id') ?? '');
    if (id) {
      await prisma.bundleSuggestion.updateMany({
        where: { id, shop },
        data: { status: 'dismissed' },
      });
    }
    return json({ ok: true });
  }

  if (intent === 'approve') {
    const id = String(form.get('id') ?? '');
    if (!id) return json({ ok: false, error: 'Missing id.' }, { status: 400 });
    const row = await prisma.bundleSuggestion.findFirst({ where: { id, shop } });
    if (!row) return json({ ok: false, error: 'Suggestion not found.' }, { status: 404 });

    let companions: Companion[] = [];
    try {
      const parsed = JSON.parse(row.companionsJson) as unknown;
      if (Array.isArray(parsed)) {
        companions = parsed
          .filter((c): c is { gid?: unknown; title?: unknown } => typeof c === 'object' && c !== null)
          .map((c) => ({
            gid: typeof c.gid === 'string' ? c.gid : '',
            title: typeof c.title === 'string' ? c.title : '',
          }))
          .filter((c) => c.gid && c.title);
      }
    } catch {
      companions = [];
    }

    const handleBase = row.suggestedTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || `bundle-${row.id.slice(0, 8)}`;
    const handle = `${handleBase}-${row.id.slice(0, 6)}`;

    await prisma.bundle.create({
      data: {
        shop,
        title: row.suggestedTitle.slice(0, 120),
        handle,
        kind: 'fixed',
        status: 'draft',
        discountType: 'percentage',
        discountValue: row.discountPct,
        productGid: row.anchorGid,
        items: {
          create: [
            { productGid: row.anchorGid, title: row.anchorTitle, quantity: 1, position: 0 },
            ...companions.map((c, i) => ({
              productGid: c.gid,
              title: c.title,
              quantity: 1,
              position: i + 1,
            })),
          ],
        },
      },
    });

    await prisma.bundleSuggestion.update({
      where: { id: row.id },
      data: { status: 'approved' },
    });

    return json({ ok: true, approved: true });
  }

  // intent === 'generate'
  return json({
    ok: false,
    error: 'Order-history suggestions require protected customer data approval before they can be generated.',
  });
};

export default function Suggest() {
  const { aiOff, suggestions, orderHistoryEnabled } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const nav = useNavigation();
  const busy = nav.state === 'submitting';

  const generate = () => {
    const fd = new FormData();
    fd.set('intent', 'generate');
    submit(fd, { method: 'post' });
  };

  const approve = (id: string) => {
    const fd = new FormData();
    fd.set('intent', 'approve');
    fd.set('id', id);
    submit(fd, { method: 'post' });
  };

  const dismiss = (id: string) => {
    const fd = new FormData();
    fd.set('intent', 'dismiss');
    fd.set('id', id);
    submit(fd, { method: 'post' });
  };

  return (
    <Page
      title="AI-suggested bundles"
      backAction={{ url: '/app' }}
      subtitle="Bundles mined from your real co-purchase patterns, then titled and described by your AI provider."
      primaryAction={
        aiOff || !orderHistoryEnabled
          ? undefined
          : {
              content: 'Generate suggestions',
              loading: busy,
              onAction: generate,
            }
      }
    >
      <Layout>
        {!orderHistoryEnabled && (
          <Layout.Section>
            <Banner tone="warning" title="AI suggestions are not enabled">
              <Text as="p" variant="bodyMd">
                Generating suggestions requires order-history access, which Shopify
                treats as protected customer data. Core bundles and volume discounts
                are available without that approval.
              </Text>
            </Banner>
          </Layout.Section>
        )}

        {aiOff && orderHistoryEnabled && (
          <Layout.Section>
            <Banner
              tone="warning"
              title="Enable AI in Settings"
              action={{ content: 'Open Settings', url: '/app/settings' }}
            >
              <Text as="p" variant="bodyMd">
                Suggested bundles need a free-tier AI provider key. Pick OpenRouter,
                Groq, or Gemini in Settings, paste a key, save, and come back here.
              </Text>
            </Banner>
          </Layout.Section>
        )}

        {!aiOff && orderHistoryEnabled && (
          <Layout.Section>
            <Banner tone="info">
              Klyna reads the last 250 orders, finds the products most often bought
              with each anchor, and asks your AI to title a bundle of the top 3
              companions. Approve to turn it into a draft bundle you can edit, or
              dismiss to drop it.
            </Banner>
          </Layout.Section>
        )}

        {!aiOff && orderHistoryEnabled && suggestions.length === 0 ? (
          <Layout.Section>
            <Card>
              <EmptyState
                heading="No suggestions yet"
                action={{
                  content: 'Generate suggestions',
                  onAction: generate,
                  loading: busy,
                }}
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>
                  Run a generation to mine co-purchase patterns from order history
                  and have the AI propose bundles. You need a handful of multi-item
                  orders for patterns to surface.
                </p>
              </EmptyState>
            </Card>
          </Layout.Section>
        ) : null}

        {suggestions.map((s) => (
          <Layout.Section key={s.id}>
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="start" wrap={false}>
                  <BlockStack gap="100">
                    <Text as="h3" variant="headingMd">{s.suggestedTitle}</Text>
                    <Text as="p" tone="subdued" variant="bodyMd">{s.blurb}</Text>
                  </BlockStack>
                  <Badge tone="info">{`${s.discountPct}% off`}</Badge>
                </InlineStack>

                <BlockStack gap="100">
                  <Text as="span" variant="bodySm" tone="subdued">
                    Anchor: <b>{s.anchorTitle}</b>
                  </Text>
                  <Text as="span" variant="bodySm" tone="subdued">
                    Companions: {s.companions.map((c) => c.title).join(', ') || '-'}
                  </Text>
                </BlockStack>

                <InlineStack gap="200">
                  <Button
                    variant="primary"
                    loading={busy}
                    onClick={() => approve(s.id)}
                  >
                    Approve
                  </Button>
                  <Button
                    variant="secondary"
                    loading={busy}
                    onClick={() => dismiss(s.id)}
                  >
                    Dismiss
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        ))}
      </Layout>
    </Page>
  );
}
