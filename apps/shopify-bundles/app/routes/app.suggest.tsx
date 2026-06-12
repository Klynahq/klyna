// AI-suggested bundles mined from co-purchase patterns.
//
// The action runs in two phases. "generate" pulls the last 250 orders via
// Admin GraphQL, builds a co-purchase frequency map, picks the top 3 companion
// products per anchor, and calls the per-shop AI client with the productBundle
// prompt. Each non-empty response becomes a BundleSuggestion row. "approve"
// promotes a suggestion to a real Bundle + BundleItems. "dismiss" marks it
// dismissed. The page is a Polaris Page that renders pending suggestions in
// Cards with Approve and Dismiss buttons.
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
import { fetchRecentOrderBaskets, type CatalogProduct } from '../lib/admin.server';
import { getAiClientForShop, getShopAiSettings } from '../lib/ai.server';
import { PROMPTS } from '~/lib/klyna-ai-client';

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
  };
};

// Parse the BUNDLE: ... / REASON: ... structured response from
// PROMPTS.productBundle. Falls back to first non-empty line as title and the
// remainder as blurb so a slightly-off model still produces something useful.
function parseBundleResponse(
  raw: string,
  anchorTitle: string,
  companionTitles: string[],
): { title: string; blurb: string } {
  const text = raw.trim();
  if (!text) {
    return {
      title: `${anchorTitle} bundle`,
      blurb: `Bought together with ${companionTitles.slice(0, 2).join(' and ')}.`,
    };
  }
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let title = '';
  let blurb = '';
  for (const line of lines) {
    const m = /^bundle\s*:\s*(.+)$/i.exec(line);
    if (m && m[1]) {
      title = m[1].trim();
      continue;
    }
    const r = /^reason\s*:\s*(.+)$/i.exec(line);
    if (r && r[1]) {
      blurb = r[1].trim();
      continue;
    }
  }
  if (!title) title = lines[0] ?? `${anchorTitle} bundle`;
  if (!blurb) blurb = lines.slice(1).join(' ') || `Bought together with ${companionTitles.slice(0, 2).join(' and ')}.`;
  // Strip surrounding quotes if any.
  title = title.replace(/^["'`]|["'`]$/g, '').slice(0, 120);
  blurb = blurb.replace(/^["'`]|["'`]$/g, '').slice(0, 240);
  return { title, blurb };
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
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
  const aiSettings = await getShopAiSettings(shop);
  if (aiSettings.provider === 'off') {
    return json({ ok: false, error: 'Enable AI in Settings first.' }, { status: 200 });
  }

  const { baskets, products } = await fetchRecentOrderBaskets(admin, 250);
  if (baskets.length === 0) {
    return json({ ok: false, error: 'No orders found to analyze yet.' }, { status: 200 });
  }

  // Build co-purchase frequency map.
  const coPurchase = new Map<string, Map<string, number>>();
  for (const basket of baskets) {
    const ids = basket.productGids;
    for (let i = 0; i < ids.length; i++) {
      const a = ids[i];
      if (!a) continue;
      let row = coPurchase.get(a);
      if (!row) {
        row = new Map<string, number>();
        coPurchase.set(a, row);
      }
      for (let j = 0; j < ids.length; j++) {
        if (i === j) continue;
        const b = ids[j];
        if (!b) continue;
        row.set(b, (row.get(b) ?? 0) + 1);
      }
    }
  }

  const titleFor = (gid: string): string => {
    const p = products.get(gid);
    return p?.title ?? 'Product';
  };

  // Cap the number of anchors processed in a single run so we never exhaust the
  // AI quota in one click. 8 calls per generate keeps usage predictable.
  const MAX_ANCHORS_PER_RUN = 8;

  // Skip anchors that already have a pending or approved suggestion - merchant
  // hasn't acted on the last one yet.
  const existing = await prisma.bundleSuggestion.findMany({
    where: { shop, status: { in: ['pending', 'approved'] } },
    select: { anchorGid: true },
  });
  const skip = new Set(existing.map((r) => r.anchorGid));

  // Rank anchors by total co-purchase volume.
  const ranked: { anchor: string; total: number }[] = [];
  for (const [anchor, others] of coPurchase) {
    if (skip.has(anchor)) continue;
    let total = 0;
    for (const v of others.values()) total += v;
    if (total > 0) ranked.push({ anchor, total });
  }
  ranked.sort((a, b) => b.total - a.total);

  const ai = await getAiClientForShop(shop);
  let created = 0;
  let lastError: string | undefined;

  for (const { anchor } of ranked.slice(0, MAX_ANCHORS_PER_RUN)) {
    const others = coPurchase.get(anchor);
    if (!others) continue;
    const top = [...others.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([gid]) => gid);
    if (top.length === 0) continue;

    const anchorTitle = titleFor(anchor);
    const coTitles = top.map(titleFor);

    const out = await ai.complete({
      prompt: PROMPTS.productBundle(anchorTitle, coTitles),
      maxTokens: 200,
      temperature: 0.4,
    });
    if (out.error) {
      lastError = out.error;
      // Keep going on per-call errors when they look retryable, otherwise stop.
      if (out.error.toLowerCase().includes('cap reached') || out.error.toLowerCase().includes('disabled')) {
        break;
      }
      continue;
    }

    const { title, blurb } = parseBundleResponse(out.text, anchorTitle, coTitles);

    const companions: Companion[] = top
      .map((gid) => {
        const p: CatalogProduct | undefined = products.get(gid);
        return p ? { gid, title: p.title } : { gid, title: titleFor(gid) };
      });

    await prisma.bundleSuggestion.create({
      data: {
        shop,
        anchorGid: anchor,
        anchorTitle,
        companionsJson: JSON.stringify(companions),
        suggestedTitle: title,
        blurb,
        discountPct: 10,
      },
    });
    created++;
  }

  return json({
    ok: true,
    analyzed: baskets.length,
    created,
    error: created === 0 ? lastError : undefined,
  });
};

export default function Suggest() {
  const { aiOff, suggestions } = useLoaderData<typeof loader>();
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
        aiOff
          ? undefined
          : {
              content: 'Generate suggestions',
              loading: busy,
              onAction: generate,
            }
      }
    >
      <Layout>
        {aiOff && (
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

        {!aiOff && (
          <Layout.Section>
            <Banner tone="info">
              Klyna reads the last 250 orders, finds the products most often bought
              with each anchor, and asks your AI to title a bundle of the top 3
              companions. Approve to turn it into a draft bundle you can edit, or
              dismiss to drop it.
            </Banner>
          </Layout.Section>
        )}

        {!aiOff && suggestions.length === 0 ? (
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
