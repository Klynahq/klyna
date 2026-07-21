import { type AuditResult, auditPage } from '@klyna/core';
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
  ProgressBar,
  Text,
  TextField,
} from '@shopify/polaris';
import { useState } from 'react';
import prisma from '../db.server';
import { authenticate } from '../shopify.server';

type CompResult = {
  url: string;
  score: number;
  grade: string;
  findings: { id: string; severity: string; message: string }[];
  stats: AuditResult['stats'];
  meta: AuditResult['meta'];
};

function gradeTone(g: string): 'success' | 'warning' | 'critical' {
  if (g === 'A' || g === 'B') return 'success';
  if (g === 'C' || g === 'D') return 'warning';
  return 'critical';
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  // Get latest store score
  const recent = await prisma.auditResult.findMany({
    where: { shop },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  const byUrl = new Map<string, (typeof recent)[0]>();
  for (const r of recent) {
    if (!byUrl.has(r.url)) byUrl.set(r.url, r);
  }
  const latestResults = Array.from(byUrl.values());
  const myAvgScore =
    latestResults.length > 0
      ? Math.round(latestResults.reduce((s, r) => s + r.score, 0) / latestResults.length)
      : null;

  return json({ myAvgScore, pagesScanned: latestResults.length });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.admin(request);
  const form = await request.formData();
  const rawUrls = form.getAll('url').map(String).filter(Boolean);

  // Validate and normalise URLs
  const urls = rawUrls
    .map((u) => {
      try {
        const url = new URL(u.startsWith('http') ? u : `https://${u}`);
        return url.href;
      } catch {
        return null;
      }
    })
    .filter((u): u is string => u !== null)
    .slice(0, 5); // max 5 competitors

  if (urls.length === 0) {
    return json({ error: 'Add at least one valid competitor URL' }, { status: 400 });
  }

  const results: CompResult[] = [];

  await Promise.allSettled(
    urls.map(async (url) => {
      try {
        const res = await fetch(url, {
          signal: AbortSignal.timeout(12_000),
          headers: { 'User-Agent': 'KlynaBot/0.1 (+https://klyna.dev)' },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const html = await res.text();
        const result = auditPage({ url, html, fetchedAt: new Date().toISOString() });
        results.push({
          url,
          score: result.score,
          grade: result.grade,
          findings: result.findings.map((f) => ({
            id: f.id,
            severity: f.severity,
            message: f.message,
          })),
          stats: result.stats,
          meta: result.meta,
        });
      } catch (err) {
        results.push({
          url,
          score: 0,
          grade: 'F',
          findings: [
            {
              id: 'fetch-error',
              severity: 'error',
              message: err instanceof Error ? err.message : 'Failed to fetch',
            },
          ],
          stats: {
            headings: { h1: 0, h2: 0, h3: 0 },
            links: { internal: 0, external: 0, total: 0 },
            images: { total: 0, missingAlt: 0 },
            schema: { count: 0, types: [] },
            word_count: 0,
            reading_time_minutes: 0,
          },
          meta: {},
        });
      }
    }),
  );

  return json({ results });
};

export default function CompetitorPage() {
  const { myAvgScore, pagesScanned } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<{ results?: CompResult[]; error?: string }>();
  const [urls, setUrls] = useState(['', '', '']);

  const loading = fetcher.state === 'submitting';
  const results = fetcher.data?.results ?? [];
  const error = fetcher.data?.error;

  const addUrl = () => setUrls((prev) => [...prev, '']);
  const updateUrl = (i: number, v: string) =>
    setUrls((prev) => prev.map((u, idx) => (idx === i ? v : u)));
  const removeUrl = (i: number) => setUrls((prev) => prev.filter((_, idx) => idx !== i));

  const submit = () => {
    const fd = new FormData();
    for (const url of urls.filter(Boolean)) {
      fd.append('url', url);
    }
    fetcher.submit(fd, { method: 'post' });
  };

  return (
    <Page title="Competitor SEO Analysis" backAction={{ url: '/app' }}>
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <BlockStack gap="100">
                <Text as="h2" variant="headingMd">
                  Analyse competitor URLs
                </Text>
                <Text as="p" tone="subdued">
                  Klyna fetches competitor pages and runs the same SEO + GEO audit engine it uses on
                  your store. See exactly what schema types they have, how their meta is structured,
                  and where they outperform you — all without leaving the app. No API key, no
                  third-party data, just the same engine on their HTML.
                </Text>
              </BlockStack>

              <BlockStack gap="200">
                {urls.map((u, i) => (
                  <InlineStack key={String(i)} gap="200" blockAlign="end">
                    <Box minWidth="380px">
                      <TextField
                        label={i === 0 ? 'Competitor URLs (max 5)' : ''}
                        labelHidden={i > 0}
                        value={u}
                        onChange={(v) => updateUrl(i, v)}
                        placeholder="https://competitor.com/products/best-seller"
                        autoComplete="off"
                        type="url"
                      />
                    </Box>
                    {urls.length > 1 && (
                      <Button size="slim" tone="critical" onClick={() => removeUrl(i)}>
                        Remove
                      </Button>
                    )}
                  </InlineStack>
                ))}
              </BlockStack>

              <InlineStack gap="200">
                <Button
                  variant="primary"
                  onClick={submit}
                  loading={loading}
                  disabled={urls.filter(Boolean).length === 0}
                >
                  Analyse competitors
                </Button>
                {urls.length < 5 && (
                  <Button variant="secondary" onClick={addUrl}>
                    + Add URL
                  </Button>
                )}
              </InlineStack>

              {error && <Banner tone="critical" title={error} />}
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Your store benchmark */}
        {myAvgScore !== null && (
          <Layout.Section>
            <Card>
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="050">
                  <Text as="p" variant="headingMd">
                    Your store benchmark
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {pagesScanned} pages scanned · average score
                  </Text>
                </BlockStack>
                <InlineStack gap="200" blockAlign="center">
                  <Text as="p" variant="heading2xl" fontWeight="bold">
                    {myAvgScore}
                  </Text>
                  <Badge
                    tone={gradeTone(
                      myAvgScore >= 90
                        ? 'A'
                        : myAvgScore >= 80
                          ? 'B'
                          : myAvgScore >= 70
                            ? 'C'
                            : myAvgScore >= 60
                              ? 'D'
                              : 'F',
                    )}
                  >
                    {`Grade ${myAvgScore >= 90 ? 'A' : myAvgScore >= 80 ? 'B' : myAvgScore >= 70 ? 'C' : myAvgScore >= 60 ? 'D' : 'F'}`}
                  </Badge>
                </InlineStack>
              </InlineStack>
            </Card>
          </Layout.Section>
        )}

        {/* Results */}
        {results.length > 0 && !loading && (
          <>
            {/* Score comparison */}
            <Layout.Section>
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">
                    Score comparison
                  </Text>
                  <BlockStack gap="200">
                    {myAvgScore !== null && (
                      <InlineStack align="space-between" blockAlign="center">
                        <InlineStack gap="200" blockAlign="center">
                          <Badge tone="success">Your store</Badge>
                          <Text as="p" variant="bodyMd">
                            (average across {pagesScanned} pages)
                          </Text>
                        </InlineStack>
                        <InlineStack gap="200" blockAlign="center">
                          <Text as="p" variant="headingMd" fontWeight="bold">
                            {myAvgScore}
                          </Text>
                          <Box minWidth="120px">
                            <ProgressBar progress={myAvgScore} tone="primary" size="small" />
                          </Box>
                        </InlineStack>
                      </InlineStack>
                    )}
                    {results.map((r) => (
                      <InlineStack key={r.url} align="space-between" blockAlign="center">
                        <InlineStack gap="200" blockAlign="center">
                          <Text as="p" variant="bodyMd" breakWord>
                            {new URL(r.url).hostname}
                          </Text>
                        </InlineStack>
                        <InlineStack gap="200" blockAlign="center">
                          <Text as="p" variant="headingMd" fontWeight="bold">
                            {r.score}
                          </Text>
                          <Badge tone={gradeTone(r.grade)}>{r.grade}</Badge>
                          {myAvgScore !== null && r.score > myAvgScore && (
                            <Badge tone="critical">{`+${r.score - myAvgScore} ahead`}</Badge>
                          )}
                          {myAvgScore !== null && r.score < myAvgScore && (
                            <Badge tone="success">{`${myAvgScore - r.score} behind you`}</Badge>
                          )}
                          <Box minWidth="120px">
                            <ProgressBar
                              progress={r.score}
                              tone={
                                gradeTone(r.grade) === 'success'
                                  ? 'primary'
                                  : gradeTone(r.grade) === 'warning'
                                    ? 'highlight'
                                    : 'critical'
                              }
                              size="small"
                            />
                          </Box>
                        </InlineStack>
                      </InlineStack>
                    ))}
                  </BlockStack>
                </BlockStack>
              </Card>
            </Layout.Section>

            {/* Detailed breakdowns */}
            {results.map((r) => (
              <Layout.Section key={r.url}>
                <Card>
                  <BlockStack gap="400">
                    <InlineStack align="space-between" blockAlign="center">
                      <BlockStack gap="050">
                        <Text as="h3" variant="headingMd">
                          {new URL(r.url).hostname}
                        </Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          {r.url}
                        </Text>
                      </BlockStack>
                      <Badge
                        tone={gradeTone(r.grade)}
                        size="large"
                      >{`${r.score} · Grade ${r.grade}`}</Badge>
                    </InlineStack>

                    <Divider />

                    {/* Meta */}
                    <InlineGrid columns={2} gap="300">
                      <BlockStack gap="200">
                        <Text as="h4" variant="headingSm">
                          Meta
                        </Text>
                        {[
                          { label: 'Title', value: r.meta.title },
                          { label: 'Description', value: r.meta.description },
                          { label: 'OG Title', value: r.meta.ogTitle },
                          { label: 'OG Image', value: r.meta.ogImage ? '✓ Set' : null },
                          { label: 'Twitter Card', value: r.meta.twitterCard },
                        ].map(({ label, value }) => (
                          <BlockStack key={label} gap="050">
                            <Text as="p" variant="bodySm" tone="subdued">
                              {label}
                            </Text>
                            <Text as="p" variant="bodyMd">
                              {value ? (
                                String(value).slice(0, 80)
                              ) : (
                                <Text as="span" tone="critical">
                                  Missing
                                </Text>
                              )}
                            </Text>
                          </BlockStack>
                        ))}
                      </BlockStack>

                      <BlockStack gap="200">
                        <Text as="h4" variant="headingSm">
                          Content stats
                        </Text>
                        {[
                          { label: 'Word count', value: String(r.stats.word_count) },
                          { label: 'H1 count', value: String(r.stats.headings.h1) },
                          { label: 'Internal links', value: String(r.stats.links.internal) },
                          { label: 'Images total', value: String(r.stats.images.total) },
                          { label: 'Images missing alt', value: String(r.stats.images.missingAlt) },
                          {
                            label: 'Schema types',
                            value: r.stats.schema.types.join(', ') || 'None',
                          },
                        ].map(({ label, value }) => (
                          <InlineStack key={label} align="space-between">
                            <Text as="p" variant="bodySm" tone="subdued">
                              {label}
                            </Text>
                            <Text as="p" variant="bodyMd" fontWeight="semibold">
                              {value}
                            </Text>
                          </InlineStack>
                        ))}
                      </BlockStack>
                    </InlineGrid>

                    {/* Issues they have */}
                    {r.findings.filter((f) => f.severity === 'error').length > 0 && (
                      <>
                        <Divider />
                        <BlockStack gap="200">
                          <InlineStack gap="100" blockAlign="center">
                            <Text as="h4" variant="headingSm">
                              Their SEO errors
                            </Text>
                            <Badge tone="success" size="small">
                              Opportunities for you
                            </Badge>
                          </InlineStack>
                          <BlockStack gap="100">
                            {r.findings
                              .filter((f) => f.severity === 'error')
                              .slice(0, 6)
                              .map((f) => (
                                <Text key={f.id} as="p" variant="bodySm" tone="success">
                                  ✓ {f.message}
                                </Text>
                              ))}
                          </BlockStack>
                        </BlockStack>
                      </>
                    )}
                  </BlockStack>
                </Card>
              </Layout.Section>
            ))}
          </>
        )}
      </Layout>
    </Page>
  );
}
