import { type ActionFunctionArgs, type LoaderFunctionArgs, json, redirect } from '@remix-run/node';
import { useActionData, useLoaderData, useNavigation, useSubmit } from '@remix-run/react';
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  Checkbox,
  ChoiceList,
  Divider,
  InlineGrid,
  InlineStack,
  Layout,
  List,
  Page,
  Select,
  Text,
  TextField,
} from '@shopify/polaris';
import { useCallback, useMemo, useState } from 'react';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';
import { generateFeed, ensureShopSettings } from '../lib/feeds.server';
import {
  CHANNELS,
  FEED_FIELD_ORDER,
  PRODUCT_ATTR_LABELS,
  FEED_FIELD_LABELS,
} from '../lib/channels';
import { toFeedConfig, type FeedRow } from '../lib/serialize';
import type {
  Channel,
  FeedField,
  FieldMap,
  FieldMapEntry,
  IncludeRules,
  ProductAttr,
  TaxonomyMap,
} from '../lib/types';

interface CollectionOpt {
  id: string;
  handle: string;
  title: string;
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const settings = await ensureShopSettings(session.shop);

  const feed = await prisma.feed.findFirst({
    where: { id: params.id, shop: session.shop },
    include: { runs: { orderBy: { createdAt: 'desc' }, take: 1 } },
  });
  if (!feed) throw redirect('/app/feeds');

  // Pull collections for the include-rule picker and taxonomy mapping.
  const res = await admin.graphql(`#graphql
    query KlynaCollections {
      collections(first: 100, sortKey: TITLE) {
        nodes { id handle title }
      }
    }
  `);
  const payload = (await res.json()) as {
    data?: { collections: { nodes: CollectionOpt[] } };
  };
  const collections = payload.data?.collections.nodes ?? [];

  const config = toFeedConfig(feed as unknown as FeedRow, {
    metafieldNamespace: settings.metafieldNamespace,
    defaultGoogleCategory: settings.defaultGoogleCategory ?? null,
  });

  const appUrl = process.env.SHOPIFY_APP_URL ?? 'https://klyna.dev';
  const feedUrl = `${appUrl}/feeds/${feed.token}.${feed.format === 'xml' ? 'xml' : 'csv'}`;

  const last = feed.runs[0];

  return {
    feed: {
      id: feed.id,
      name: feed.name,
      channel: feed.channel as Channel,
      format: feed.format,
      enabled: feed.enabled,
      currency: feed.currency,
      language: feed.language,
      refreshEveryMin: feed.refreshEveryMin,
      lastRefreshAt: feed.lastRefreshAt ? feed.lastRefreshAt.toISOString() : null,
      nextRefreshAt: feed.nextRefreshAt ? feed.nextRefreshAt.toISOString() : null,
    },
    config: {
      fieldMap: config.fieldMap,
      taxonomyMap: config.taxonomyMap,
      includeRules: config.includeRules,
    },
    collections,
    feedUrl,
    namespace: settings.metafieldNamespace,
    lastRun: last
      ? {
          itemCount: last.itemCount,
          includedCount: last.includedCount,
          excludedCount: last.excludedCount,
          warningCount: last.warningCount,
          status: last.status,
          createdAt: last.createdAt.toISOString(),
        }
      : null,
  };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const feed = await prisma.feed.findFirst({ where: { id: params.id, shop: session.shop } });
  if (!feed) return json({ error: 'Feed not found' }, { status: 404 });

  const form = await request.formData();
  const intent = String(form.get('intent') ?? '');

  switch (intent) {
    case 'save-mapping': {
      const fieldMap = JSON.parse(String(form.get('fieldMap') ?? '{}')) as FieldMap;
      await prisma.feed.update({
        where: { id: feed.id },
        data: { fieldMap: JSON.stringify(fieldMap) },
      });
      return json({ ok: 'Field mapping saved.' });
    }
    case 'save-taxonomy': {
      const taxonomyMap = JSON.parse(String(form.get('taxonomyMap') ?? '{}')) as TaxonomyMap;
      await prisma.feed.update({
        where: { id: feed.id },
        data: { taxonomyMap: JSON.stringify(taxonomyMap) },
      });
      return json({ ok: 'Taxonomy mapping saved.' });
    }
    case 'save-rules': {
      const includeRules = JSON.parse(String(form.get('includeRules') ?? '{}')) as IncludeRules;
      await prisma.feed.update({
        where: { id: feed.id },
        data: { includeRules: JSON.stringify(includeRules) },
      });
      return json({ ok: 'Include rules saved.' });
    }
    case 'save-schedule': {
      const refreshEveryMin = Number.parseInt(String(form.get('refreshEveryMin') ?? '360'), 10);
      const next =
        refreshEveryMin > 0 ? new Date(Date.now() + refreshEveryMin * 60_000) : null;
      await prisma.feed.update({
        where: { id: feed.id },
        data: { refreshEveryMin: Number.isFinite(refreshEveryMin) ? refreshEveryMin : 360, nextRefreshAt: next },
      });
      return json({ ok: 'Schedule updated.' });
    }
    case 'toggle': {
      await prisma.feed.update({
        where: { id: feed.id },
        data: { enabled: !feed.enabled },
      });
      return json({ ok: feed.enabled ? 'Feed paused.' : 'Feed enabled.' });
    }
    case 'refresh': {
      try {
        const { result } = await generateFeed(admin, {
          feedId: feed.id,
          shop: session.shop,
          trigger: 'manual',
        });
        return json({
          ok: `Refreshed — ${result.includedCount} items in feed (${result.excludedCount} excluded), health ${result.health.grade}.`,
        });
      } catch (err) {
        return json(
          { error: err instanceof Error ? err.message : 'Refresh failed' },
          { status: 500 },
        );
      }
    }
    case 'delete': {
      await prisma.feed.delete({ where: { id: feed.id } });
      return redirect('/app/feeds');
    }
    default:
      return json({ error: 'Unknown action' }, { status: 400 });
  }
};

const PRODUCT_ATTRS: (ProductAttr | '')[] = [
  '',
  'title',
  'description',
  'vendor',
  'productType',
  'handle',
  'tags',
  'sku',
  'barcode',
  'price',
  'compareAtPrice',
  'image',
  'availability',
  'optionColor',
  'optionSize',
  'optionMaterial',
];

const REFRESH_OPTIONS = [
  { label: 'Manual only', value: '0' },
  { label: 'Every hour', value: '60' },
  { label: 'Every 6 hours', value: '360' },
  { label: 'Every 12 hours', value: '720' },
  { label: 'Daily', value: '1440' },
];

const STATUS_CHOICES = [
  { label: 'Active', value: 'ACTIVE' },
  { label: 'Draft', value: 'DRAFT' },
  { label: 'Archived', value: 'ARCHIVED' },
];

export default function FeedDetail() {
  const { feed, config, collections, feedUrl, namespace, lastRun } =
    useLoaderData<typeof loader>();
  const data = useActionData<typeof action>();
  const nav = useNavigation();
  const submit = useSubmit();
  const busy = nav.state !== 'idle';

  const channelDef = CHANNELS[feed.channel];

  // --- Field mapping state ---------------------------------------------------
  const [fieldMap, setFieldMap] = useState<FieldMap>(config.fieldMap);
  const setEntry = useCallback(
    (field: FeedField, patch: Partial<FieldMapEntry>) => {
      setFieldMap((prev) => ({ ...prev, [field]: { ...prev[field], ...patch } }));
    },
    [],
  );

  // --- Taxonomy mapping state ------------------------------------------------
  const [taxonomyMap, setTaxonomyMap] = useState<TaxonomyMap>(config.taxonomyMap);
  const setTaxonomy = useCallback((handle: string, value: string) => {
    setTaxonomyMap((prev) => {
      const next = { ...prev };
      if (value.trim()) next[handle] = value.trim();
      else delete next[handle];
      return next;
    });
  }, []);

  // --- Include rules state ---------------------------------------------------
  const [rules, setRules] = useState<IncludeRules>(config.includeRules);
  const patchRules = useCallback((patch: Partial<IncludeRules>) => {
    setRules((prev) => ({ ...prev, ...patch }));
  }, []);

  const [refresh, setRefresh] = useState(String(feed.refreshEveryMin));

  const collectionChoices = useMemo(
    () => collections.map((c) => ({ label: c.title, value: c.id })),
    [collections],
  );

  const ok = data && 'ok' in data ? data.ok : null;
  const error = data && 'error' in data ? data.error : null;

  const post = (fields: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    submit(fd, { method: 'post' });
  };

  return (
    <Page
      title={feed.name}
      backAction={{ url: '/app/feeds' }}
      titleMetadata={
        <InlineStack gap="200">
          <Badge tone={feed.enabled ? 'success' : undefined}>
            {feed.enabled ? 'Live' : 'Paused'}
          </Badge>
          <Badge>{channelDef.label}</Badge>
        </InlineStack>
      }
      secondaryActions={[
        {
          content: feed.enabled ? 'Pause' : 'Enable',
          onAction: () => post({ intent: 'toggle' }),
        },
        {
          content: 'Delete',
          destructive: true,
          onAction: () => post({ intent: 'delete' }),
        },
      ]}
      primaryAction={{
        content: busy && nav.formData?.get('intent') === 'refresh' ? 'Refreshing…' : 'Refresh now',
        loading: busy && nav.formData?.get('intent') === 'refresh',
        onAction: () => post({ intent: 'refresh' }),
      }}
    >
      <Layout>
        {ok && (
          <Layout.Section>
            <Banner tone="success" onDismiss={() => undefined}>{String(ok)}</Banner>
          </Layout.Section>
        )}
        {error && (
          <Layout.Section>
            <Banner tone="critical" onDismiss={() => undefined}>{String(error)}</Banner>
          </Layout.Section>
        )}

        {/* Feed URL + last run summary */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Feed URL</Text>
              <Text as="p" tone="subdued">
                Paste this into {channelDef.label} ({' '}
                <a href={channelDef.docsUrl} target="_blank" rel="noreferrer">setup docs</a>
                ). It always serves the latest generated snapshot.
              </Text>
              <Box
                padding="300"
                background="bg-surface-secondary"
                borderRadius="200"
                borderColor="border"
                borderWidth="025"
              >
                <Text as="p" variant="bodyMd" breakWord>{feedUrl}</Text>
              </Box>
              {lastRun ? (
                <InlineStack gap="400">
                  <Metric label="Items in feed" value={String(lastRun.includedCount)} />
                  <Metric label="Excluded" value={String(lastRun.excludedCount)} />
                  <Metric label="Warnings" value={String(lastRun.warningCount)} />
                  <Metric
                    label="Last build"
                    value={new Date(lastRun.createdAt).toLocaleString()}
                  />
                </InlineStack>
              ) : (
                <Banner tone="info">
                  This feed has never been generated. Hit "Refresh now" to build it.
                </Banner>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Field mapping */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Field mapping</Text>
              <Text as="p" tone="subdued">
                Map each {channelDef.label} field to a product attribute or a metafield
                in <code>{namespace}.&lt;key&gt;</code>. Metafields win over attributes; the
                fallback is used when both are empty. Required fields are flagged.
              </Text>
              <BlockStack gap="200">
                {FEED_FIELD_ORDER.map((field) => {
                  const entry = fieldMap[field] ?? {};
                  const required = channelDef.required.includes(field);
                  const recommended = channelDef.recommended.includes(field);
                  return (
                    <Box
                      key={field}
                      padding="200"
                      borderColor="border"
                      borderWidth="025"
                      borderRadius="200"
                    >
                      <InlineGrid columns={{ xs: 1, md: 4 }} gap="200">
                        <InlineStack gap="100" blockAlign="center">
                          <Text as="span" variant="bodyMd" fontWeight="medium">
                            {FEED_FIELD_LABELS[field]}
                          </Text>
                          {required && <Badge tone="critical" size="small">Required</Badge>}
                          {!required && recommended && (
                            <Badge tone="warning" size="small">Recommended</Badge>
                          )}
                        </InlineStack>
                        <Select
                          label="Source"
                          labelHidden
                          options={PRODUCT_ATTRS.map((a) => ({
                            label: PRODUCT_ATTR_LABELS[a] ?? a,
                            value: a,
                          }))}
                          value={entry.source ?? ''}
                          onChange={(v) => setEntry(field, { source: v as ProductAttr | '' })}
                        />
                        <TextField
                          label="Metafield"
                          labelHidden
                          placeholder={`${namespace}.${field}`}
                          autoComplete="off"
                          value={entry.metafield ?? ''}
                          onChange={(v) => setEntry(field, { metafield: v })}
                        />
                        <TextField
                          label="Fallback"
                          labelHidden
                          placeholder="Fallback value"
                          autoComplete="off"
                          value={entry.fallback ?? ''}
                          onChange={(v) => setEntry(field, { fallback: v })}
                        />
                      </InlineGrid>
                    </Box>
                  );
                })}
              </BlockStack>
              <InlineStack align="end">
                <Button
                  variant="primary"
                  onClick={() => post({ intent: 'save-mapping', fieldMap: JSON.stringify(fieldMap) })}
                >
                  Save field mapping
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Taxonomy mapping */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Taxonomy mapping</Text>
              <Text as="p" tone="subdued">
                Assign a Google product category id to each collection. Items inherit the
                category of the first matching collection; otherwise the shop default
                (Settings) applies. Find ids in the{' '}
                <a
                  href="https://support.google.com/merchants/answer/6324436"
                  target="_blank"
                  rel="noreferrer"
                >
                  Google product taxonomy
                </a>
                .
              </Text>
              <BlockStack gap="200">
                {collections.length === 0 && (
                  <Text as="p" tone="subdued">No collections found on this store.</Text>
                )}
                {collections.map((c) => (
                  <InlineGrid key={c.id} columns={{ xs: 1, md: 2 }} gap="200">
                    <InlineStack blockAlign="center">
                      <Text as="span" variant="bodyMd">{c.title}</Text>
                    </InlineStack>
                    <TextField
                      label={c.title}
                      labelHidden
                      placeholder="e.g. 166 (Apparel & Accessories)"
                      autoComplete="off"
                      value={taxonomyMap[c.handle] ?? ''}
                      onChange={(v) => setTaxonomy(c.handle, v)}
                    />
                  </InlineGrid>
                ))}
              </BlockStack>
              {collections.length > 0 && (
                <InlineStack align="end">
                  <Button
                    variant="primary"
                    onClick={() =>
                      post({ intent: 'save-taxonomy', taxonomyMap: JSON.stringify(taxonomyMap) })
                    }
                  >
                    Save taxonomy
                  </Button>
                </InlineStack>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Include / exclude rules */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Include / exclude rules</Text>
              <ChoiceList
                title="Product status to include"
                allowMultiple
                choices={STATUS_CHOICES}
                selected={rules.status}
                onChange={(v) => patchRules({ status: v as IncludeRules['status'] })}
              />
              <Checkbox
                label="Only products published to the Online Store"
                checked={rules.publishedOnly}
                onChange={(v) => patchRules({ publishedOnly: v })}
              />
              <Checkbox
                label="Require an image (drop items with no image)"
                checked={rules.requireImage}
                onChange={(v) => patchRules({ requireImage: v })}
              />
              <Checkbox
                label="Require a price (drop items priced at 0)"
                checked={rules.requirePrice}
                onChange={(v) => patchRules({ requirePrice: v })}
              />
              <Divider />
              {collectionChoices.length > 0 && (
                <ChoiceList
                  title="Limit to collections (optional)"
                  allowMultiple
                  choices={collectionChoices}
                  selected={rules.collectionIds}
                  onChange={(v) => patchRules({ collectionIds: v })}
                />
              )}
              <TextField
                label="Exclude products with these tags"
                helpText="Comma-separated. Case-insensitive."
                autoComplete="off"
                value={rules.excludeTags.join(', ')}
                onChange={(v) =>
                  patchRules({
                    excludeTags: v.split(',').map((t) => t.trim()).filter(Boolean),
                  })
                }
              />
              <InlineGrid columns={{ xs: 1, md: 2 }} gap="200">
                <TextField
                  label="Minimum price"
                  type="number"
                  autoComplete="off"
                  value={rules.minPrice == null ? '' : String(rules.minPrice)}
                  onChange={(v) => patchRules({ minPrice: v === '' ? null : Number(v) })}
                />
                <TextField
                  label="Maximum price"
                  type="number"
                  autoComplete="off"
                  value={rules.maxPrice == null ? '' : String(rules.maxPrice)}
                  onChange={(v) => patchRules({ maxPrice: v === '' ? null : Number(v) })}
                />
              </InlineGrid>
              <InlineStack align="end">
                <Button
                  variant="primary"
                  onClick={() => post({ intent: 'save-rules', includeRules: JSON.stringify(rules) })}
                >
                  Save rules
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Schedule */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Scheduled refresh</Text>
              <Text as="p" tone="subdued">
                Klyna rebuilds this feed on a schedule and whenever a product changes
                (via webhook). The hosted cron hits <code>/cron/refresh</code> to process
                due feeds.
              </Text>
              <Select
                label="Rebuild every"
                options={REFRESH_OPTIONS}
                value={refresh}
                onChange={setRefresh}
              />
              {feed.nextRefreshAt && (
                <Text as="p" variant="bodySm" tone="subdued">
                  Next scheduled rebuild: {new Date(feed.nextRefreshAt).toLocaleString()}
                </Text>
              )}
              <InlineStack align="end">
                <Button
                  variant="primary"
                  onClick={() => post({ intent: 'save-schedule', refreshEveryMin: refresh })}
                >
                  Save schedule
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text as="h3" variant="headingSm">How delivery works</Text>
              <List type="bullet">
                <List.Item>
                  The feed URL serves the most recent generated snapshot — no live query,
                  so channel crawlers get a fast, stable response.
                </List.Item>
                <List.Item>
                  A product update webhook flags the feed; the next cron tick rebuilds it.
                </List.Item>
                <List.Item>
                  The URL carries an unguessable token so only systems you give it to can
                  read your catalog.
                </List.Item>
              </List>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <BlockStack gap="050">
      <Text as="span" variant="headingMd" fontWeight="bold">{value}</Text>
      <Text as="span" variant="bodySm" tone="subdued">{label}</Text>
    </BlockStack>
  );
}
