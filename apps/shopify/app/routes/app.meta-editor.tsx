import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/node';
import { useFetcher, useLoaderData } from '@remix-run/react';
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  Divider,
  InlineGrid,
  InlineStack,
  Layout,
  Page,
  Tabs,
  Text,
  TextField,
} from '@shopify/polaris';
import { useCallback, useEffect, useState } from 'react';
import prisma from '../db.server';
import { authenticate } from '../shopify.server';

type MetaRow = {
  id: string;
  handle: string;
  title: string;
  seoTitle: string | null;
  seoDescription: string | null;
  url: string | null;
  type: 'product' | 'collection' | 'page';
};

function scoreField(
  value: string | null,
  min: number,
  max: number,
): 'good' | 'short' | 'missing' | 'long' {
  if (!value || value.trim() === '') return 'missing';
  const len = value.trim().length;
  if (len < min) return 'short';
  if (len > max) return 'long';
  return 'good';
}

function fieldBadge(score: 'good' | 'short' | 'missing' | 'long') {
  const map = {
    good: { label: 'Good', tone: 'success' as const },
    short: { label: 'Too short', tone: 'warning' as const },
    missing: { label: 'Missing', tone: 'critical' as const },
    long: { label: 'Too long', tone: 'warning' as const },
  };
  return map[score];
}

async function paginateGql<T>(
  admin: { graphql: (q: string, o?: { variables?: Record<string, unknown> }) => Promise<Response> },
  query: string,
  extract: (d: unknown) => {
    nodes: T[];
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  },
  max = 250,
): Promise<T[]> {
  const all: T[] = [];
  let cursor: string | null = null;
  while (all.length < max) {
    const res = await admin.graphql(query, { variables: { cursor } });
    const j = (await res.json()) as { data: unknown };
    const { nodes, pageInfo } = extract(j.data);
    all.push(...nodes);
    if (!pageInfo.hasNextPage) break;
    cursor = pageInfo.endCursor;
  }
  return all.slice(0, max);
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;

  type ShopData = { data: { shop: { primaryDomain: { url: string } } } };
  const shopRes = await admin.graphql('{ shop { primaryDomain { url } } }');
  const shopJson = (await shopRes.json()) as ShopData;
  const baseUrl = shopJson.data.shop.primaryDomain.url.replace(/\/$/, '');

  type P = {
    id: string;
    handle: string;
    title: string;
    seo: { title: string | null; description: string | null };
  };
  type C = {
    id: string;
    handle: string;
    title: string;
    seo: { title: string | null; description: string | null };
  };
  type Pg = { id: string; handle: string; title: string };

  const [products, collections, pages] = await Promise.all([
    paginateGql<P>(
      admin,
      `query ($cursor: String) {
        products(first: 50, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes { id handle title seo { title description } }
        }
      }`,
      (d) =>
        (
          d as {
            products: { nodes: P[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } };
          }
        ).products,
    ),
    paginateGql<C>(
      admin,
      `query ($cursor: String) {
        collections(first: 50, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes { id handle title seo { title description } }
        }
      }`,
      (d) =>
        (
          d as {
            collections: {
              nodes: C[];
              pageInfo: { hasNextPage: boolean; endCursor: string | null };
            };
          }
        ).collections,
    ),
    paginateGql<Pg>(
      admin,
      `query ($cursor: String) {
        pages(first: 50, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes { id handle title }
        }
      }`,
      (d) =>
        (
          d as {
            pages: { nodes: Pg[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } };
          }
        ).pages,
    ),
  ]);

  const rows: MetaRow[] = [
    ...products.map((p) => ({
      id: p.id,
      handle: p.handle,
      title: p.title,
      seoTitle: p.seo.title,
      seoDescription: p.seo.description,
      url: `${baseUrl}/products/${p.handle}`,
      type: 'product' as const,
    })),
    ...collections.map((c) => ({
      id: c.id,
      handle: c.handle,
      title: c.title,
      seoTitle: c.seo.title,
      seoDescription: c.seo.description,
      url: `${baseUrl}/collections/${c.handle}`,
      type: 'collection' as const,
    })),
    ...pages.map((pg) => ({
      id: pg.id,
      handle: pg.handle,
      title: pg.title,
      seoTitle: null,
      seoDescription: null,
      url: `${baseUrl}/pages/${pg.handle}`,
      type: 'page' as const,
    })),
  ];

  return json({ shop, rows });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();
  const id = String(form.get('id'));
  const type = String(form.get('type')) as 'product' | 'collection' | 'page';
  const seoTitle = String(form.get('seoTitle') ?? '').trim() || null;
  const seoDescription = String(form.get('seoDescription') ?? '').trim() || null;

  try {
    if (type === 'product') {
      const res = await admin.graphql(
        `mutation klynaProductSeo($input: ProductInput!) {
          productUpdate(input: $input) {
            product { id }
            userErrors { field message }
          }
        }`,
        {
          variables: {
            input: { id, seo: { title: seoTitle ?? '', description: seoDescription ?? '' } },
          },
        },
      );
      const gql = (await res.json()) as {
        data: { productUpdate: { userErrors: { message: string }[] } };
      };
      const error = gql.data.productUpdate.userErrors[0];
      if (error) return json({ error: error.message, id }, { status: 400 });
    } else if (type === 'collection') {
      const res = await admin.graphql(
        `mutation klynaCollSeo($input: CollectionInput!) {
          collectionUpdate(input: $input) {
            collection { id }
            userErrors { field message }
          }
        }`,
        {
          variables: {
            input: { id, seo: { title: seoTitle ?? '', description: seoDescription ?? '' } },
          },
        },
      );
      const gql = (await res.json()) as {
        data: { collectionUpdate: { userErrors: { message: string }[] } };
      };
      const error = gql.data.collectionUpdate.userErrors[0];
      if (error) return json({ error: error.message, id }, { status: 400 });
    } else if (type === 'page') {
      const res = await admin.graphql(
        `mutation klynaPageSeoMeta($ownerId: ID!, $title: String!, $desc: String!) {
          metafieldsSet(metafields: [
            { ownerId: $ownerId, namespace: "global", key: "title_tag",       type: "single_line_text_field", value: $title }
            { ownerId: $ownerId, namespace: "global", key: "description_tag", type: "single_line_text_field", value: $desc }
          ]) { userErrors { field message } }
        }`,
        { variables: { ownerId: id, title: seoTitle ?? '', desc: seoDescription ?? '' } },
      );
      const gql = (await res.json()) as {
        data: { metafieldsSet: { userErrors: { message: string }[] } };
      };
      const error = gql.data.metafieldsSet.userErrors[0];
      if (error) return json({ error: error.message, id }, { status: 400 });
    }

    const logRows = [
      ...(seoTitle
        ? [{ shop, resourceId: id, url: id, field: 'seo.title', newValue: seoTitle }]
        : []),
      ...(seoDescription
        ? [{ shop, resourceId: id, url: id, field: 'seo.description', newValue: seoDescription }]
        : []),
    ];
    if (logRows.length > 0) {
      await prisma.fixLog.createMany({ data: logRows });
    }

    return json({ saved: true, id });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Save failed', id }, { status: 500 });
  }
};

type RowEditorProps = {
  row: MetaRow;
  onSaved: (id: string) => void;
  saved: boolean;
};

function RowEditor({ row, onSaved, saved }: RowEditorProps) {
  const fetcher = useFetcher<{ saved?: boolean; error?: string; id?: string }>();
  const [title, setTitle] = useState(row.seoTitle ?? '');
  const [desc, setDesc] = useState(row.seoDescription ?? '');

  const titleScore = scoreField(title, 30, 60);
  const descScore = scoreField(desc, 80, 160);
  const isSaving = fetcher.state === 'submitting';
  const justSaved = saved || (fetcher.data?.saved && fetcher.data.id === row.id);

  useEffect(() => {
    if (fetcher.data?.saved && fetcher.data.id === row.id && !fetcher.data.error) {
      onSaved(row.id);
    }
  }, [fetcher.data, onSaved, row.id]);

  const save = () => {
    const fd = new FormData();
    fd.set('id', row.id);
    fd.set('type', row.type);
    fd.set('seoTitle', title);
    fd.set('seoDescription', desc);
    fetcher.submit(fd, { method: 'post' });
  };

  const titleBadge = fieldBadge(titleScore);
  const descBadge = fieldBadge(descScore);

  return (
    <BlockStack gap="200">
      <InlineStack align="space-between" blockAlign="center">
        <BlockStack gap="050">
          <Text as="p" variant="bodyMd" fontWeight="semibold">
            {row.title}
          </Text>
          <Text as="p" variant="bodySm" tone="subdued">
            /{row.handle}
          </Text>
        </BlockStack>
        {justSaved ? (
          <Badge tone="success">Saved</Badge>
        ) : (
          <Button size="slim" onClick={save} loading={isSaving}>
            Save
          </Button>
        )}
      </InlineStack>

      <InlineGrid columns={2} gap="200">
        <BlockStack gap="100">
          <InlineStack gap="100" blockAlign="center">
            <Text as="p" variant="bodySm" tone="subdued">
              SEO title ({title.length}/60)
            </Text>
            <Badge tone={titleBadge.tone} size="small">
              {titleBadge.label}
            </Badge>
          </InlineStack>
          <TextField
            label=""
            labelHidden
            value={title}
            onChange={setTitle}
            placeholder={row.title}
            autoComplete="off"
            maxLength={70}
            showCharacterCount
          />
        </BlockStack>
        <BlockStack gap="100">
          <InlineStack gap="100" blockAlign="center">
            <Text as="p" variant="bodySm" tone="subdued">
              Meta description ({desc.length}/160)
            </Text>
            <Badge tone={descBadge.tone} size="small">
              {descBadge.label}
            </Badge>
          </InlineStack>
          <TextField
            label=""
            labelHidden
            value={desc}
            onChange={setDesc}
            multiline={2}
            autoComplete="off"
            maxLength={200}
            showCharacterCount
          />
        </BlockStack>
      </InlineGrid>

      {/* SERP preview */}
      {(title || desc) && (
        <Box
          background="bg-surface-secondary"
          padding="300"
          borderRadius="200"
          borderWidth="025"
          borderColor="border"
        >
          <BlockStack gap="050">
            <Text as="p" variant="bodySm" tone="subdued">
              SERP preview
            </Text>
            <Text as="p" variant="bodyMd" tone="magic">
              {(title || row.title).slice(0, 60)}
            </Text>
            <Text as="p" variant="bodySm" tone="subdued">
              {row.url ?? `/${row.type}s/${row.handle}`}
            </Text>
            <Text as="p" variant="bodyMd">
              {(
                desc || 'No meta description set — Google will pull a snippet from page content.'
              ).slice(0, 160)}
            </Text>
          </BlockStack>
        </Box>
      )}

      {fetcher.data?.error && (
        <Text as="p" tone="critical" variant="bodySm">
          {fetcher.data.error}
        </Text>
      )}
    </BlockStack>
  );
}

export default function MetaEditorPage() {
  const { rows } = useLoaderData<typeof loader>();
  const [selectedTab, setSelectedTab] = useState(0);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  const tabs = [
    {
      id: 'products',
      content: `Products (${rows.filter((r) => r.type === 'product').length})`,
      panelID: 'products-panel',
    },
    {
      id: 'collections',
      content: `Collections (${rows.filter((r) => r.type === 'collection').length})`,
      panelID: 'collections-panel',
    },
    {
      id: 'pages',
      content: `Pages (${rows.filter((r) => r.type === 'page').length})`,
      panelID: 'pages-panel',
    },
  ];

  const typeMap = ['product', 'collection', 'page'] as const;
  const currentType = typeMap[selectedTab];
  const currentRows = rows.filter((r) => r.type === currentType);

  const missing = currentRows.filter((r) => !r.seoTitle || !r.seoDescription);

  const onSaved = useCallback((id: string) => {
    setSavedIds((prev) => new Set([...prev, id]));
  }, []);

  return (
    <Page title="Meta Bulk Editor" backAction={{ url: '/app' }}>
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingMd">
                    SEO titles + meta descriptions
                  </Text>
                  <Text as="p" tone="subdued">
                    Edit and preview how your pages appear in Google. Changes save directly to
                    Shopify. Green = optimal length · Amber = too short or long · Red = missing.
                  </Text>
                </BlockStack>
                {missing.length > 0 && (
                  <Badge tone="critical">{`${missing.length} missing fields`}</Badge>
                )}
              </InlineStack>

              <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab} />
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <BlockStack gap="300">
            {currentRows.length === 0 ? (
              <Banner tone="info" title="No items found">
                <Text as="p" variant="bodyMd">
                  No {currentType}s found in your store.
                </Text>
              </Banner>
            ) : (
              currentRows.map((row, i) => (
                <Card key={row.id}>
                  <BlockStack gap="300">
                    <RowEditor row={row} onSaved={onSaved} saved={savedIds.has(row.id)} />
                    {i < currentRows.length - 1 && <Divider />}
                  </BlockStack>
                </Card>
              ))
            )}
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
