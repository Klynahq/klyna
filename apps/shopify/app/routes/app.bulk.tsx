import { type LoaderFunctionArgs, json } from '@remix-run/node';
import { useFetcher, useLoaderData } from '@remix-run/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  Divider,
  InlineStack,
  Layout,
  Page,
  ProgressBar,
  Spinner,
  Text,
} from '@shopify/polaris';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';

type ScanRow = {
  url: string;
  score: number;
  grade: string;
  errors: number;
  warnings: number;
  ok: boolean;
  error?: string;
};

type WorkerData = { results: ScanRow[] };

function gradeTone(g: string): 'success' | 'warning' | 'critical' {
  if (g === 'A' || g === 'B') return 'success';
  if (g === 'C' || g === 'D') return 'warning';
  return 'critical';
}

async function paginateGql<T>(
  admin: { graphql: (q: string, o?: { variables?: Record<string, unknown> }) => Promise<Response> },
  query: string,
  extract: (data: unknown) => { nodes: T[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } },
  max = 250,
): Promise<T[]> {
  const all: T[] = [];
  let cursor: string | null = null;
  while (all.length < max) {
    const res = await admin.graphql(query, { variables: { cursor } });
    const json = (await res.json()) as { data: unknown };
    const { nodes, pageInfo } = extract(json.data);
    all.push(...nodes);
    if (!pageInfo.hasNextPage) break;
    cursor = pageInfo.endCursor;
  }
  return all.slice(0, max);
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;

  // Get store domain for URL construction
  type ShopData = { data: { shop: { myshopifyDomain: string; primaryDomain: { url: string } } } };
  const shopRes = await admin.graphql(`{ shop { myshopifyDomain primaryDomain { url } } }`);
  const shopJson = (await shopRes.json()) as ShopData;
  const baseUrl = shopJson.data.shop.primaryDomain.url.replace(/\/$/, '');
  const myDomain = shopJson.data.shop.myshopifyDomain;

  type ProductNode = { handle: string; onlineStoreUrl: string | null };
  type CollectionNode = { handle: string };
  type PageNode = { handle: string };

  const [products, collections, pages] = await Promise.all([
    paginateGql<ProductNode>(
      admin,
      `query ($cursor: String) {
        products(first: 50, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes { handle onlineStoreUrl }
        }
      }`,
      (d) => (d as { products: { nodes: ProductNode[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } }).products,
    ),
    paginateGql<CollectionNode>(
      admin,
      `query ($cursor: String) {
        collections(first: 50, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes { handle }
        }
      }`,
      (d) => (d as { collections: { nodes: CollectionNode[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } }).collections,
    ),
    paginateGql<PageNode>(
      admin,
      `query ($cursor: String) {
        pages(first: 50, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes { handle }
        }
      }`,
      (d) => (d as { pages: { nodes: PageNode[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } }).pages,
    ),
  ]);

  const allUrls: string[] = [
    baseUrl, // homepage
    ...products.map((p) => p.onlineStoreUrl ?? `https://${myDomain}/products/${p.handle}`),
    ...collections.map((c) => `${baseUrl}/collections/${c.handle}`),
    ...pages.map((pg) => `${baseUrl}/pages/${pg.handle}`),
  ].filter(Boolean);

  // Deduplicate
  const uniqueUrls = [...new Set(allUrls)];

  // Last scan results from DB
  const recent = await prisma.auditResult.findMany({
    where: { shop },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });
  const latestByUrl = new Map<string, typeof recent[0]>();
  for (const r of recent) {
    if (!latestByUrl.has(r.url)) latestByUrl.set(r.url, r);
  }

  const lastScan = await prisma.bulkScan.findFirst({
    where: { shop },
    orderBy: { startedAt: 'desc' },
  });

  return json({
    shop,
    allUrls: uniqueUrls,
    previousResults: Array.from(latestByUrl.values()).map((r) => ({
      url: r.url,
      score: r.score,
      grade: r.grade,
      scannedAt: r.createdAt.toISOString(),
    })),
    lastScan: lastScan
      ? { scannedUrls: lastScan.scannedUrls, totalUrls: lastScan.totalUrls, finishedAt: lastScan.finishedAt?.toISOString() ?? null }
      : null,
  });
};

const BATCH_SIZE = 5;

export default function BulkAudit() {
  const { allUrls, previousResults, lastScan } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<WorkerData>();

  const [scanning, setScanning] = useState(false);
  const [results, setResults] = useState<ScanRow[]>(
    previousResults.map((r) => ({ url: r.url, score: r.score, grade: r.grade, errors: 0, warnings: 0, ok: true })),
  );
  const [submitted, setSubmitted] = useState(0);
  const [filter, setFilter] = useState<'all' | 'error' | 'warn'>('all');
  const indexRef = useRef(0);

  const submitBatch = useCallback(
    (fromIndex: number) => {
      const batch = allUrls.slice(fromIndex, fromIndex + BATCH_SIZE);
      if (batch.length === 0) {
        setScanning(false);
        return;
      }
      indexRef.current = fromIndex + batch.length;
      const fd = new FormData();
      batch.forEach((url) => fd.append('url', url));
      fetcher.submit(fd, { method: 'post', action: '/app/bulk-worker' });
    },
    [allUrls, fetcher],
  );

  const startScan = useCallback(() => {
    indexRef.current = 0;
    setResults([]);
    setSubmitted(0);
    setScanning(true);
    submitBatch(0);
  }, [submitBatch]);

  // When fetcher completes a batch
  const prevState = useRef(fetcher.state);
  useEffect(() => {
    const prev = prevState.current;
    prevState.current = fetcher.state;

    if (prev !== 'idle' && fetcher.state === 'idle' && fetcher.data?.results) {
      const batchResults = fetcher.data.results.filter((r) => r.url);
      setResults((prev) => {
        const map = new Map(prev.map((r) => [r.url, r]));
        for (const r of batchResults) map.set(r.url, r);
        return Array.from(map.values());
      });
      setSubmitted(indexRef.current);
      if (scanning) submitBatch(indexRef.current);
    }
  }, [fetcher.state, fetcher.data, scanning, submitBatch]);

  const progress = allUrls.length > 0 ? Math.round((submitted / allUrls.length) * 100) : 0;
  const avgScore =
    results.length > 0 ? Math.round(results.reduce((s, r) => s + r.score, 0) / results.length) : null;

  const filtered = results.filter((r) => {
    if (filter === 'error') return r.errors > 0;
    if (filter === 'warn') return r.warnings > 0;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => a.score - b.score);

  return (
    <Page title="Bulk Store Audit" backAction={{ url: '/app' }}>
      <Layout>
        {/* Controls */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingMd">Scan every page in your store</Text>
                  <Text as="p" tone="subdued">
                    {allUrls.length} URLs found — {allUrls.length} products, collections, and pages.
                    Klyna fetches and audits each one locally.
                  </Text>
                </BlockStack>
                <Button
                  variant="primary"
                  onClick={startScan}
                  loading={scanning}
                  disabled={scanning}
                >
                  {scanning ? 'Scanning…' : results.length > 0 ? 'Re-scan store' : 'Scan store'}
                </Button>
              </InlineStack>

              {scanning && (
                <BlockStack gap="200">
                  <InlineStack gap="200" blockAlign="center">
                    <Spinner size="small" />
                    <Text as="p" variant="bodyMd">
                      Auditing {submitted} of {allUrls.length} pages…
                    </Text>
                  </InlineStack>
                  <ProgressBar progress={progress} tone="primary" />
                </BlockStack>
              )}

              {!scanning && results.length > 0 && avgScore !== null && (
                <InlineStack gap="400" blockAlign="center">
                  <BlockStack gap="050">
                    <Text as="p" variant="headingLg" fontWeight="bold">{avgScore}</Text>
                    <Text as="p" variant="bodySm" tone="subdued">Average score</Text>
                  </BlockStack>
                  <BlockStack gap="050">
                    <Text as="p" variant="headingLg" fontWeight="bold" tone="critical">
                      {results.filter((r) => r.errors > 0).length}
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">Pages with errors</Text>
                  </BlockStack>
                  <BlockStack gap="050">
                    <Text as="p" variant="headingLg" fontWeight="bold" tone="caution">
                      {results.filter((r) => r.warnings > 0).length}
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">Pages with warnings</Text>
                  </BlockStack>
                  <BlockStack gap="050">
                    <Text as="p" variant="headingLg" fontWeight="bold" tone="success">
                      {results.filter((r) => r.score >= 80).length}
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">Pages scoring 80+</Text>
                  </BlockStack>
                </InlineStack>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Results table */}
        {results.length > 0 && (
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">
                    Results — {sorted.length} page{sorted.length !== 1 ? 's' : ''}
                  </Text>
                  <InlineStack gap="200">
                    {(['all', 'error', 'warn'] as const).map((f) => (
                      <Button
                        key={f}
                        size="slim"
                        variant={filter === f ? 'primary' : 'secondary'}
                        onClick={() => setFilter(f)}
                      >
                        {f === 'all' ? 'All' : f === 'error' ? 'Errors only' : 'Warnings only'}
                      </Button>
                    ))}
                  </InlineStack>
                </InlineStack>

                <Divider />

                <BlockStack gap="0">
                  {/* Header row */}
                  <Box padding="200" background="bg-surface-secondary">
                    <InlineStack align="space-between">
                      <Text as="p" variant="bodySm" fontWeight="semibold" tone="subdued">URL</Text>
                      <InlineStack gap="400">
                        <Text as="p" variant="bodySm" fontWeight="semibold" tone="subdued">Score</Text>
                        <Text as="p" variant="bodySm" fontWeight="semibold" tone="subdued">Grade</Text>
                        <Text as="p" variant="bodySm" fontWeight="semibold" tone="subdued">Issues</Text>
                        <Text as="p" variant="bodySm" fontWeight="semibold" tone="subdued">Action</Text>
                      </InlineStack>
                    </InlineStack>
                  </Box>

                  {sorted.map((r, i) => (
                    <Box
                      key={r.url}
                      padding="300"
                      background={i % 2 === 0 ? 'bg-surface' : 'bg-surface-secondary'}
                    >
                      <InlineStack align="space-between" blockAlign="center">
                        <Box maxWidth="450px">
                          <Text as="p" variant="bodyMd" breakWord>
                            {r.url.replace(/^https?:\/\/[^/]+/, '') || '/'}
                          </Text>
                          {r.error && (
                            <Text as="p" variant="bodySm" tone="critical">{r.error}</Text>
                          )}
                        </Box>
                        <InlineStack gap="400" blockAlign="center">
                          <Text as="p" variant="bodyMd" fontWeight="bold">{r.score}</Text>
                          <Badge tone={gradeTone(r.grade)}>{r.grade}</Badge>
                          <Text as="p" variant="bodySm">
                            {r.errors > 0 && (
                              <Text as="span" tone="critical">{r.errors}E </Text>
                            )}
                            {r.warnings > 0 && (
                              <Text as="span" tone="caution">{r.warnings}W</Text>
                            )}
                            {r.errors === 0 && r.warnings === 0 && (
                              <Text as="span" tone="success">✓</Text>
                            )}
                          </Text>
                          <Button
                            size="slim"
                            url={`/app/audit?url=${encodeURIComponent(r.url)}`}
                          >
                            Fix
                          </Button>
                        </InlineStack>
                      </InlineStack>
                    </Box>
                  ))}
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        )}

        {/* Last scan info */}
        {lastScan && results.length === 0 && (
          <Layout.Section>
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">Previous scan</Text>
                <Text as="p" tone="subdued">
                  {lastScan.scannedUrls} of {lastScan.totalUrls} URLs scanned
                  {lastScan.finishedAt ? ` · ${new Date(lastScan.finishedAt).toLocaleString()}` : ''}
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        )}
      </Layout>
    </Page>
  );
}
