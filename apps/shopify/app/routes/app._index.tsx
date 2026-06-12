import { type LoaderFunctionArgs, json } from '@remix-run/node';
import { Link, useLoaderData } from '@remix-run/react';
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
} from '@shopify/polaris';
import type { Finding } from '@klyna/core';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';
import { getShopAiSettings } from '../lib/ai.server';

function gradeFor(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function gradeTone(g: string): 'success' | 'warning' | 'critical' | 'info' {
  if (g === 'A' || g === 'B') return 'success';
  if (g === 'C' || g === 'D') return 'warning';
  return 'critical';
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;

  type ShopRes = {
    data: { shop: { name: string; myshopifyDomain: string; primaryDomain: { url: string } } };
  };
  const shopRes = await admin.graphql(`{ shop { name myshopifyDomain primaryDomain { url } } }`);
  const shopInfo = ((await shopRes.json()) as ShopRes).data.shop;

  // Fetch recent audit results for this shop
  const allResults = await prisma.auditResult.findMany({
    where: { shop },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });

  // Latest result per URL
  const latestByUrl = new Map<string, typeof allResults[0]>();
  for (const r of allResults) {
    if (!latestByUrl.has(r.url)) latestByUrl.set(r.url, r);
  }
  const latest = Array.from(latestByUrl.values());

  // Aggregate store score
  const avgScore =
    latest.length > 0
      ? Math.round(latest.reduce((sum, r) => sum + r.score, 0) / latest.length)
      : null;

  // Issues breakdown across all latest results
  let errors = 0;
  let warnings = 0;
  let infos = 0;
  for (const r of latest) {
    try {
      const findings = JSON.parse(r.findings) as Finding[];
      errors += findings.filter((f) => f.severity === 'error').length;
      warnings += findings.filter((f) => f.severity === 'warn').length;
      infos += findings.filter((f) => f.severity === 'info').length;
    } catch {
      // skip unparseable
    }
  }

  // Top 5 worst pages
  const worst = latest
    .sort((a, b) => a.score - b.score)
    .slice(0, 5)
    .map((r) => ({
      url: r.url,
      score: r.score,
      grade: r.grade,
    }));

  // Score history: last 7 days
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recentHistory = allResults
    .filter((r) => r.createdAt > sevenDaysAgo)
    .reverse(); // oldest first

  // Group by day
  const byDay = new Map<string, number[]>();
  for (const r of recentHistory) {
    const day = r.createdAt.toISOString().slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(r.score);
  }
  const scoreHistory = Array.from(byDay.entries()).map(([day, scores]) => ({
    day,
    avg: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
  }));

  // Last bulk scan
  const lastScan = await prisma.bulkScan.findFirst({
    where: { shop },
    orderBy: { startedAt: 'desc' },
  });

  const ai = await getShopAiSettings(shop);

  return json({
    shop,
    shopName: shopInfo.name,
    avgScore,
    overallGrade: avgScore !== null ? gradeFor(avgScore) : null,
    pagesScanned: latest.length,
    errors,
    warnings,
    infos,
    worst,
    scoreHistory,
    lastScan: lastScan
      ? {
          scannedUrls: lastScan.scannedUrls,
          totalUrls: lastScan.totalUrls,
          finishedAt: lastScan.finishedAt?.toISOString() ?? null,
        }
      : null,
    aiEnabled: ai.provider !== 'off' && !!ai.apiKey,
    aiProvider: ai.provider,
  });
};

export default function Dashboard() {
  const {
    shop,
    shopName,
    avgScore,
    overallGrade,
    pagesScanned,
    errors,
    warnings,
    infos,
    worst,
    scoreHistory,
    lastScan,
    aiEnabled,
    aiProvider,
  } = useLoaderData<typeof loader>();

  const totalIssues = errors + warnings + infos;

  const coreActions = [
    {
      icon: '🔍',
      title: 'Bulk Store Audit',
      desc: 'Scan every product, collection, and page in one pass. Issues sorted by impact.',
      to: '/app/bulk',
      cta: 'Scan store',
      badge: pagesScanned > 0 ? `${pagesScanned} pages` : undefined,
    },
    {
      icon: '🏷️',
      title: 'Schema Markup',
      desc: 'Inject Organization, Product, Breadcrumb, and FAQ schema. Unlock rich results in Google.',
      to: '/app/schema',
      cta: 'Configure schema',
    },
    {
      icon: '🖼️',
      title: 'Image Alt Text',
      desc: 'Find every product image missing alt text. Fix all at once with auto-generated descriptions.',
      to: '/app/alt-text',
      cta: 'Fix alt text',
    },
    {
      icon: '✏️',
      title: 'Meta Bulk Editor',
      desc: 'Edit SEO titles and descriptions for all products, collections, and pages in one view.',
      to: '/app/meta-editor',
      cta: 'Open editor',
    },
    {
      icon: '🔗',
      title: 'Internal Links',
      desc: 'Find orphaned pages and missing links using TF-IDF semantic similarity — no third-party API.',
      to: '/app/links',
      cta: 'Find links',
    },
    {
      icon: '📎',
      title: 'Canonical Auditor',
      desc: 'Detect products in multiple collections generating duplicate indexable URLs — and the one-line Liquid fix.',
      to: '/app/canonical',
      cta: 'Audit URLs',
    },
  ];

  const advancedActions = [
    {
      icon: '⚡',
      title: 'Core Web Vitals',
      desc: 'Real Lighthouse + CrUX field data via Google PageSpeed Insights. LCP, CLS, FCP — no API key needed.',
      to: '/app/vitals',
      cta: 'Check speed',
      badge: 'Free · No key',
    },
    {
      icon: '🔤',
      title: 'Keyword Analysis',
      desc: 'Semantic keyword gap detector powered by Datamuse. Finds missing terms across your entire store content.',
      to: '/app/keywords',
      cta: 'Analyse keywords',
      badge: 'Free · No key',
    },
    {
      icon: '🤖',
      title: 'GEO Score',
      desc: 'Measure AI-engine citation readiness and generate llms.txt for ChatGPT, Claude, and Perplexity crawlers.',
      to: '/app/geo',
      cta: 'Check GEO score',
      badge: 'New',
    },
    {
      icon: '🕵️',
      title: 'Competitor Audit',
      desc: 'Run the same SEO audit engine on competitor URLs. See their errors — those are your opportunities.',
      to: '/app/competitor',
      cta: 'Analyse competitors',
    },
    {
      icon: '📄',
      title: 'Page Audit',
      desc: 'Single-URL deep audit. Full findings list, meta preview, schema check, and content stats.',
      to: '/app/audit',
      cta: 'Audit a page',
    },
    {
      icon: '⚙️',
      title: 'Settings',
      desc: aiEnabled
        ? `AI connected via ${aiProvider}. Content generation is active.`
        : 'Connect a free AI provider (OpenRouter / Groq / Gemini) for content suggestions.',
      to: '/app/settings',
      cta: aiEnabled ? `Connected · ${aiProvider}` : 'Set up AI',
      badge: aiEnabled ? 'AI active' : undefined,
    },
  ];

  return (
    <Page title={`Klyna SEO — ${shopName}`} subtitle={shop}>
      <Layout>
        {/* Quick-start banner — only shown before first scan */}
        {avgScore === null && (
          <Layout.Section>
            <Banner
              tone="info"
              title="Start with a Bulk Audit to get your store's SEO score"
              action={{ content: 'Run Bulk Audit', url: '/app/bulk' }}
            >
              <Text as="p" variant="bodyMd">
                Klyna will scan every product, collection, and page in your store, score each one,
                and show you exactly what to fix — sorted by impact.
              </Text>
            </Banner>
          </Layout.Section>
        )}

        {/* Store Score */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingLg">Store SEO score</Text>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    {pagesScanned > 0
                      ? `Averaged across ${pagesScanned} scanned page${pagesScanned !== 1 ? 's' : ''}`
                      : 'Run a bulk audit to see your store score'}
                  </Text>
                </BlockStack>
                {avgScore !== null && overallGrade && (
                  <InlineStack gap="400" blockAlign="center">
                    <Box
                      background={
                        overallGrade === 'A' || overallGrade === 'B'
                          ? 'bg-fill-success'
                          : overallGrade === 'C' || overallGrade === 'D'
                          ? 'bg-fill-caution'
                          : 'bg-fill-critical'
                      }
                      borderRadius="full"
                      padding="500"
                      minWidth="80px"
                    >
                      <BlockStack inlineAlign="center" gap="0">
                        <Text
                          as="p"
                          variant="heading2xl"
                          fontWeight="bold"
                          tone={
                            overallGrade === 'A' || overallGrade === 'B'
                              ? 'success'
                              : overallGrade === 'C' || overallGrade === 'D'
                              ? 'caution'
                              : 'critical'
                          }
                        >
                          {avgScore}
                        </Text>
                        <Text
                          as="p"
                          variant="bodySm"
                          fontWeight="semibold"
                          tone={
                            overallGrade === 'A' || overallGrade === 'B'
                              ? 'success'
                              : overallGrade === 'C' || overallGrade === 'D'
                              ? 'caution'
                              : 'critical'
                          }
                        >
                          {`Grade ${overallGrade}`}
                        </Text>
                      </BlockStack>
                    </Box>
                  </InlineStack>
                )}
                {avgScore === null && (
                  <Button url="/app/bulk" variant="primary">Scan your store</Button>
                )}
              </InlineStack>

              {avgScore !== null && (
                <>
                  <Divider />
                  <InlineGrid columns={3} gap="400">
                    <BlockStack gap="100">
                      <Text as="p" variant="headingXl" tone="critical" fontWeight="bold">
                        {errors}
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">Errors</Text>
                    </BlockStack>
                    <BlockStack gap="100">
                      <Text as="p" variant="headingXl" tone="caution" fontWeight="bold">
                        {warnings}
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">Warnings</Text>
                    </BlockStack>
                    <BlockStack gap="100">
                      <Text as="p" variant="headingXl" fontWeight="bold">
                        {infos}
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">Info</Text>
                    </BlockStack>
                  </InlineGrid>

                  {totalIssues > 0 && (
                    <Box paddingBlockStart="100">
                      <BlockStack gap="100">
                        <Text as="p" variant="bodySm" tone="subdued">Issues breakdown</Text>
                        <ProgressBar
                          progress={errors > 0 ? Math.max(5, Math.round((errors / totalIssues) * 100)) : 0}
                          tone="critical"
                          size="small"
                        />
                        <ProgressBar
                          progress={warnings > 0 ? Math.max(5, Math.round((warnings / totalIssues) * 100)) : 0}
                          tone="highlight"
                          size="small"
                        />
                      </BlockStack>
                    </Box>
                  )}
                </>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Worst pages */}
        {worst.length > 0 && (
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Pages needing attention</Text>
                <BlockStack gap="200">
                  {worst.map((p) => (
                    <BlockStack key={p.url} gap="100">
                      <InlineStack align="space-between" blockAlign="center">
                        <BlockStack gap="050">
                          <Text as="p" variant="bodyMd">
                            {p.url.replace(/^https?:\/\/[^/]+/, '') || '/'}
                          </Text>
                          <Text as="p" variant="bodySm" tone="subdued">{p.url}</Text>
                        </BlockStack>
                        <InlineStack gap="200" blockAlign="center">
                          <Text as="p" variant="headingMd" fontWeight="bold">{p.score}</Text>
                          <Badge tone={gradeTone(p.grade)}>{`Grade ${p.grade}`}</Badge>
                        </InlineStack>
                      </InlineStack>
                      <ProgressBar progress={p.score} tone="critical" size="small" />
                    </BlockStack>
                  ))}
                </BlockStack>
                <Button url="/app/bulk" variant="plain">View all pages →</Button>
              </BlockStack>
            </Card>
          </Layout.Section>
        )}

        {/* Score history */}
        {scoreHistory.length > 1 && (
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Score trend · last 7 days</Text>
                <InlineStack gap="400" blockAlign="end">
                  {scoreHistory.map((s) => (
                    <BlockStack key={s.day} gap="100" inlineAlign="center">
                      <Badge tone={gradeTone(gradeFor(s.avg))}>{String(s.avg)}</Badge>
                      <Text as="p" variant="bodySm" tone="subdued">
                        {s.day.slice(5)}
                      </Text>
                    </BlockStack>
                  ))}
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        )}

        {/* Last scan info */}
        {lastScan && (
          <Layout.Section>
            <Box paddingBlockEnd="200">
              <InlineStack gap="200" blockAlign="center">
                <Text as="p" variant="bodySm" tone="subdued">
                  Last full scan: {lastScan.scannedUrls} / {lastScan.totalUrls} URLs
                  {lastScan.finishedAt
                    ? ` · ${new Date(lastScan.finishedAt).toLocaleString()}`
                    : ' · In progress'}
                </Text>
                <Button url="/app/bulk" variant="plain" size="slim">Re-scan →</Button>
              </InlineStack>
            </Box>
          </Layout.Section>
        )}

        {/* Core fix modules */}
        <Layout.Section>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Fix SEO issues</Text>
            <InlineGrid columns={{ xs: 1, sm: 2, md: 3 }} gap="300">
              {coreActions.map((a) => (
                <Card key={a.to}>
                  <BlockStack gap="300">
                    <InlineStack align="space-between" blockAlign="start">
                      <InlineStack gap="150" blockAlign="center">
                        <Text as="span" variant="headingMd">{a.icon}</Text>
                        <Text as="h3" variant="headingSm">{a.title}</Text>
                      </InlineStack>
                      {a.badge && <Badge tone="success">{a.badge}</Badge>}
                    </InlineStack>
                    <Text as="p" variant="bodyMd" tone="subdued">{a.desc}</Text>
                    <Link to={a.to}>{a.cta} →</Link>
                  </BlockStack>
                </Card>
              ))}
            </InlineGrid>
          </BlockStack>
        </Layout.Section>

        {/* Advanced tools */}
        <Layout.Section>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Advanced tools</Text>
            <InlineGrid columns={{ xs: 1, sm: 2, md: 3 }} gap="300">
              {advancedActions.map((a) => (
                <Card key={a.to}>
                  <BlockStack gap="300">
                    <InlineStack align="space-between" blockAlign="start">
                      <InlineStack gap="150" blockAlign="center">
                        <Text as="span" variant="headingMd">{a.icon}</Text>
                        <Text as="h3" variant="headingSm">{a.title}</Text>
                      </InlineStack>
                      {a.badge && (
                        <Badge tone={a.badge === 'New' ? 'info' : a.badge === 'AI active' ? 'success' : 'magic'}>
                          {a.badge}
                        </Badge>
                      )}
                    </InlineStack>
                    <Text as="p" variant="bodyMd" tone="subdued">{a.desc}</Text>
                    <Link to={a.to}>{a.cta} →</Link>
                  </BlockStack>
                </Card>
              ))}
            </InlineGrid>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
