import type { Finding } from '@klyna/core';
import { type LoaderFunctionArgs, json } from '@remix-run/node';
import { Link, useLoaderData } from '@remix-run/react';
import {
  Badge,
  BlockStack,
  Button,
  Card,
  Icon,
  InlineStack,
  Layout,
  Page,
  ProgressBar,
  Text,
} from '@shopify/polaris';
import {
  AutomationIcon,
  CodeIcon,
  EditIcon,
  GaugeIcon,
  ImageAltIcon,
  LinkIcon,
  MagicIcon,
  PageIcon,
  SearchIcon,
  SearchListIcon,
  SettingsIcon,
  TextIcon,
} from '@shopify/polaris-icons';
import type { CSSProperties } from 'react';
import prisma from '../db.server';
import { getShopAiSettings } from '../lib/ai.server';
import { authenticate } from '../shopify.server';

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
  const shopRes = await admin.graphql('{ shop { name myshopifyDomain primaryDomain { url } } }');
  const shopInfo = ((await shopRes.json()) as ShopRes).data.shop;

  // Fetch recent audit results for this shop
  const allResults = await prisma.auditResult.findMany({
    where: { shop },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });

  // Latest result per URL
  const latestByUrl = new Map<string, (typeof allResults)[0]>();
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
  const recentHistory = allResults.filter((r) => r.createdAt > sevenDaysAgo).reverse(); // oldest first

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
  const score = avgScore ?? 0;
  const hasCompletedScan = Boolean(lastScan?.finishedAt);
  const pagesForSummary = pagesScanned > 0 ? pagesScanned : (lastScan?.scannedUrls ?? 0);

  const coreActions = [
    {
      icon: AutomationIcon,
      title: 'Store audit',
      desc: 'Scan products, collections, and pages. Review issues in priority order.',
      to: '/app/bulk',
      cta: 'Run store audit',
      badge: pagesForSummary > 0 ? `${pagesForSummary} URLs` : undefined,
    },
    {
      icon: CodeIcon,
      title: 'Schema markup',
      desc: 'Manage Organization, Product, Breadcrumb, and FAQ structured data.',
      to: '/app/schema',
      cta: 'Manage schema',
    },
    {
      icon: ImageAltIcon,
      title: 'Image alt text',
      desc: 'Find missing image descriptions and update them in bulk.',
      to: '/app/alt-text',
      cta: 'Review images',
    },
    {
      icon: EditIcon,
      title: 'Meta editor',
      desc: 'Update search titles and descriptions across store content.',
      to: '/app/meta-editor',
      cta: 'Open editor',
    },
    {
      icon: LinkIcon,
      title: 'Internal links',
      desc: 'Find orphaned pages and relevant places to add internal links.',
      to: '/app/links',
      cta: 'Review links',
    },
    {
      icon: PageIcon,
      title: 'Canonical URLs',
      desc: 'Detect duplicate indexable URLs and review the preferred page version.',
      to: '/app/canonical',
      cta: 'Check URLs',
    },
  ];

  const advancedActions = [
    {
      icon: GaugeIcon,
      title: 'Core Web Vitals',
      desc: 'Check Lighthouse and field performance data for important store pages.',
      to: '/app/vitals',
      cta: 'Check speed',
      badge: 'No API key',
    },
    {
      icon: TextIcon,
      title: 'Keyword coverage',
      desc: 'Compare target topics with the words shoppers see on each page.',
      to: '/app/keywords',
      cta: 'Review keywords',
      badge: 'No API key',
    },
    {
      icon: MagicIcon,
      title: 'AI search readiness',
      desc: 'Review citation signals and create an llms.txt file for AI crawlers.',
      to: '/app/geo',
      cta: 'Check readiness',
      badge: 'New',
    },
    {
      icon: SearchListIcon,
      title: 'Competitor comparison',
      desc: 'Compare a competitor page with the same checks used for your store.',
      to: '/app/competitor',
      cta: 'Compare a page',
    },
    {
      icon: SearchIcon,
      title: 'Page audit',
      desc: 'Inspect one URL for metadata, headings, schema, links, and content.',
      to: '/app/audit',
      cta: 'Audit a page',
    },
    {
      icon: SettingsIcon,
      title: 'Settings',
      desc: aiEnabled
        ? `AI suggestions are connected through ${aiProvider}.`
        : 'Connect an AI provider to generate optional content suggestions.',
      to: '/app/settings',
      cta: aiEnabled ? 'Manage connection' : 'Connect AI',
      badge: aiEnabled ? 'AI active' : undefined,
    },
  ];

  return (
    <Page title="SEO overview" subtitle={`${shopName} | ${shop}`}>
      <Layout>
        <Layout.Section>
          <div className="KlynaDashboardLead">
            <div className="KlynaDashboardLead__copy">
              <p className="KlynaEyebrow">Store health</p>
              <h2 className="KlynaLeadTitle">
                {avgScore === null
                  ? hasCompletedScan
                    ? 'Run a fresh audit to calculate your score'
                    : 'Build your first SEO worklist'
                  : totalIssues === 0
                    ? 'Your latest scan found no open issues'
                    : `${totalIssues} issue${totalIssues === 1 ? '' : 's'} need review`}
              </h2>
              <p className="KlynaLeadBody">
                {pagesScanned > 0
                  ? `This score reflects the latest result for ${pagesScanned} scanned page${pagesScanned === 1 ? '' : 's'}. Fix high-impact errors first, then scan again to measure progress.`
                  : hasCompletedScan
                    ? `Your last scan checked ${pagesForSummary} URL${pagesForSummary === 1 ? '' : 's'}, but no page scores are available. Run a fresh audit to rebuild the worklist.`
                    : 'Klyna checks the technical and on-page signals that affect how search engines understand your store.'}
              </p>
              <div className="KlynaActions">
                <Button url="/app/bulk" variant="primary">
                  {avgScore === null
                    ? hasCompletedScan
                      ? 'Run fresh audit'
                      : 'Run store audit'
                    : 'Scan again'}
                </Button>
                <Button url="/app/audit">Audit one page</Button>
              </div>
            </div>
            <div className="KlynaScore" style={{ '--score': score } as CSSProperties}>
              <span className="KlynaScore__label">SEO score</span>
              <span className="KlynaScore__value">
                <strong>{avgScore ?? '--'}</strong>
                <span className="KlynaScore__total">/ 100</span>
              </span>
              <span className="KlynaScore__track">
                <span className="KlynaScore__fill" />
              </span>
              {overallGrade && <span className="KlynaScore__label">Grade {overallGrade}</span>}
            </div>
          </div>
        </Layout.Section>

        <Layout.Section>
          <Card padding="0">
            <div className="KlynaMetricStrip">
              <div className="KlynaMetric">
                <span className="KlynaMetric__label">
                  {pagesScanned > 0 ? 'Pages scored' : 'URLs checked'}
                </span>
                <strong className="KlynaMetric__value KlynaMetric__value--data">
                  {pagesForSummary}
                </strong>
              </div>
              <div className="KlynaMetric">
                <span className="KlynaMetric__label">Errors</span>
                <strong className="KlynaMetric__value KlynaMetric__value--critical">
                  {errors}
                </strong>
              </div>
              <div className="KlynaMetric">
                <span className="KlynaMetric__label">Warnings</span>
                <strong className="KlynaMetric__value KlynaMetric__value--warning">
                  {warnings}
                </strong>
              </div>
              <div className="KlynaMetric">
                <span className="KlynaMetric__label">Recommendations</span>
                <strong className="KlynaMetric__value">{infos}</strong>
              </div>
            </div>
          </Card>
        </Layout.Section>

        {worst.length > 0 && (
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <div className="KlynaSectionHeader">
                  <div>
                    <h2>Pages needing attention</h2>
                    <p>Start with the lowest-scoring pages from the latest scan.</p>
                  </div>
                  <Button url="/app/bulk" variant="plain">
                    View audit
                  </Button>
                </div>
                <BlockStack gap="200">
                  {worst.map((p) => (
                    <BlockStack key={p.url} gap="100">
                      <InlineStack align="space-between" blockAlign="center">
                        <BlockStack gap="050">
                          <Text as="p" variant="bodyMd">
                            {p.url.replace(/^https?:\/\/[^/]+/, '') || '/'}
                          </Text>
                          <Text as="p" variant="bodySm" tone="subdued">
                            {p.url}
                          </Text>
                        </BlockStack>
                        <InlineStack gap="200" blockAlign="center">
                          <Text as="p" variant="headingMd" fontWeight="bold">
                            {p.score}
                          </Text>
                          <Badge tone={gradeTone(p.grade)}>{`Grade ${p.grade}`}</Badge>
                        </InlineStack>
                      </InlineStack>
                      <ProgressBar
                        progress={p.score}
                        tone={p.score >= 80 ? 'success' : p.score >= 60 ? 'highlight' : 'critical'}
                        size="small"
                      />
                    </BlockStack>
                  ))}
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        )}

        {scoreHistory.length > 1 && (
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Score trend, last 7 days
                </Text>
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

        {lastScan && (
          <Layout.Section>
            <div className="KlynaPlanBar">
              <div className="KlynaPlanBar__copy">
                <Text as="h2" variant="headingSm">
                  Last full scan
                </Text>
                <p>
                  {lastScan.scannedUrls} of {lastScan.totalUrls} URLs
                  {lastScan.finishedAt
                    ? ` | ${new Date(lastScan.finishedAt).toLocaleString()}`
                    : ' | In progress'}
                </p>
              </div>
              <Button url="/app/bulk">Open scan</Button>
            </div>
          </Layout.Section>
        )}

        <Layout.Section>
          <div className="KlynaSectionHeader">
            <div>
              <h2>Fix store SEO</h2>
              <p>Work through the checks that affect discovery and search appearance.</p>
            </div>
          </div>
          <div className="KlynaToolGrid">
            {coreActions.map((action) => (
              <Link className="KlynaToolLink" key={action.to} to={action.to}>
                <span className="KlynaToolLink__icon">
                  <Icon source={action.icon} />
                </span>
                <span className="KlynaToolLink__content">
                  <span className="KlynaToolLink__title">{action.title}</span>
                  <span className="KlynaToolLink__body">{action.desc}</span>
                  {action.badge && <span className="KlynaInlineBadge">{action.badge}</span>}
                  <span className="KlynaToolLink__action">{action.cta}</span>
                </span>
              </Link>
            ))}
          </div>
        </Layout.Section>

        <Layout.Section>
          <div className="KlynaSectionHeader">
            <div>
              <h2>Research and performance</h2>
              <p>Go deeper on speed, topics, AI search, and competitor pages.</p>
            </div>
          </div>
          <div className="KlynaToolGrid">
            {advancedActions.map((action) => (
              <Link className="KlynaToolLink" key={action.to} to={action.to}>
                <span className="KlynaToolLink__icon">
                  <Icon source={action.icon} />
                </span>
                <span className="KlynaToolLink__content">
                  <span className="KlynaToolLink__title">{action.title}</span>
                  <span className="KlynaToolLink__body">{action.desc}</span>
                  {action.badge && <span className="KlynaInlineBadge">{action.badge}</span>}
                  <span className="KlynaToolLink__action">{action.cta}</span>
                </span>
              </Link>
            ))}
          </div>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
