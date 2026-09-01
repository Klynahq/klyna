import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/node';
import { Form, Link, useActionData, useLoaderData, useNavigation } from '@remix-run/react';
import {
  Badge,
  Banner,
  BlockStack,
  Button,
  Card,
  InlineStack,
  Layout,
  Page,
  Text,
} from '@shopify/polaris';
import type { CSSProperties } from 'react';
import prisma from '../db.server';
import { getActiveBillingState } from '../lib/billing-plans';
import { useEmbeddedRoute } from '../lib/embedded-routes';
import { type ProductReport, getProductKey, products, toneForStatus } from '../lib/products';
import { buildReport } from '../lib/scanners.server';
import { getShopSnapshot } from '../lib/shopify-data.server';
import { authenticate, isBillingTest } from '../shopify.server';

const FREE_SCAN_LIMIT = 3;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin, billing } = await authenticate.admin(request);
  const productKey = getProductKey();
  const product = products[productKey];
  let hasActivePayment = false;

  try {
    const billingState = await getActiveBillingState(admin, billing, isBillingTest());
    hasActivePayment = billingState.hasActivePayment;
  } catch (error) {
    console.error('Billing check failed on dashboard; using free access.', error);
  }

  const latest = await prisma.diagnosticScan.findFirst({
    where: { shop: session.shop, productKey },
    orderBy: { createdAt: 'desc' },
  });

  let report: ProductReport;
  if (latest) {
    report = {
      productKey,
      score: latest.score,
      status: latest.status as ProductReport['status'],
      summary: latest.summary,
      metrics: JSON.parse(latest.metrics),
      findings: JSON.parse(latest.findings),
      generatedAt: latest.createdAt.toISOString(),
    };
  } else {
    const snapshot = await getShopSnapshot(admin, productKey);
    report = await buildReport(productKey, snapshot);
    await saveReport(session.shop, report, 'baseline');
  }

  const monthlyScanCount = await prisma.diagnosticScan.count({
    where: {
      shop: session.shop,
      productKey,
      origin: 'manual',
      createdAt: { gte: startOfCurrentUtcMonth() },
    },
  });

  const history = await prisma.diagnosticScan.findMany({
    where: { shop: session.shop, productKey },
    orderBy: { createdAt: 'desc' },
    take: hasActivePayment ? 5 : 1,
  });

  return json({
    shop: session.shop,
    product,
    report,
    hasActivePayment,
    monthlyScanCount,
    freeScanLimit: FREE_SCAN_LIMIT,
    history: history.map((scan) => ({
      id: scan.id,
      score: scan.score,
      status: scan.status,
      createdAtLabel: formatScanDate(scan.createdAt),
    })),
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin, billing } = await authenticate.admin(request);
  const productKey = getProductKey();
  let hasActivePayment = false;

  try {
    const billingState = await getActiveBillingState(admin, billing, isBillingTest());
    hasActivePayment = billingState.hasActivePayment;
  } catch (error) {
    console.error('Billing check failed before scan; using free access.', error);
  }

  if (!hasActivePayment) {
    const monthlyScanCount = await prisma.diagnosticScan.count({
      where: {
        shop: session.shop,
        productKey,
        origin: 'manual',
        createdAt: { gte: startOfCurrentUtcMonth() },
      },
    });

    if (monthlyScanCount >= FREE_SCAN_LIMIT) {
      return json(
        {
          ok: false,
          error: `The free plan includes ${FREE_SCAN_LIMIT} checks each month. Upgrade to Pro for unlimited checks and exports.`,
        },
        { status: 429 },
      );
    }
  }

  const snapshot = await getShopSnapshot(admin, productKey);
  const report = await buildReport(productKey, snapshot);
  await saveReport(session.shop, report);
  return json({ ok: true, error: null });
};

async function saveReport(
  shop: string,
  report: ProductReport,
  origin: 'baseline' | 'manual' = 'manual',
) {
  await prisma.diagnosticScan.create({
    data: {
      shop,
      productKey: report.productKey,
      origin,
      score: report.score,
      status: report.status,
      summary: report.summary,
      metrics: JSON.stringify(report.metrics),
      findings: JSON.stringify(report.findings),
    },
  });
}

export default function Dashboard() {
  const { shop, product, report, history, hasActivePayment, monthlyScanCount, freeScanLimit } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isRunning = navigation.state !== 'idle';
  const historyUrl = useEmbeddedRoute('/app/history');
  const playbookUrl = useEmbeddedRoute('/app/playbook');
  const freeChecksRemaining = Math.max(0, freeScanLimit - monthlyScanCount);
  const canRunScan = hasActivePayment || freeChecksRemaining > 0;
  const priorityFinding =
    report.findings.find((finding) => finding.severity !== 'success') ?? report.findings[0];
  const issueCounts = {
    critical: report.findings.filter((finding) => finding.severity === 'critical').length,
    warning: report.findings.filter((finding) => finding.severity === 'warning').length,
    info: report.findings.filter((finding) => finding.severity === 'info').length,
  };

  return (
    <Page title={product.name} subtitle={shop}>
      <Layout>
        {actionData?.error ? (
          <Layout.Section>
            <Banner tone="warning" title="Free check limit reached">
              <Text as="p">{actionData.error}</Text>
            </Banner>
          </Layout.Section>
        ) : null}

        <Layout.Section>
          <div className="KlynaDashboardLead">
            <div className="KlynaDashboardLead__copy">
              <InlineStack gap="200" blockAlign="center">
                <p className="KlynaEyebrow">Live store intelligence</p>
                <Badge tone={toneForStatus(report.status)}>{labelFor(report.status)}</Badge>
              </InlineStack>
              <h2 className="KlynaLeadTitle">{product.tagline}</h2>
              <p className="KlynaLeadBody">{product.outcome}</p>
              <div className="KlynaSignalRow" aria-label="Current issue summary">
                <span>
                  <strong>{issueCounts.critical}</strong> critical
                </span>
                <span>
                  <strong>{issueCounts.warning}</strong> warnings
                </span>
                <span>
                  <strong>{issueCounts.info}</strong> notes
                </span>
              </div>
              <div className="KlynaActions">
                <Form method="post">
                  <Button submit variant="primary" loading={isRunning} disabled={!canRunScan}>
                    {product.primaryAction}
                  </Button>
                </Form>
                <Button url={playbookUrl}>{`Open ${product.workspaceName}`}</Button>
                {hasActivePayment ? (
                  <Button onClick={() => downloadReport(product.name, report)}>Export CSV</Button>
                ) : null}
              </div>
            </div>
            <div className="KlynaHealthPanel">
              <div
                className="KlynaScore"
                style={{ '--score': Math.max(0, Math.min(report.score, 100)) } as CSSProperties}
              >
                <span className="KlynaScore__label">Health score</span>
                <span className="KlynaScore__value">
                  <strong>{report.score}</strong>
                  <span className="KlynaScore__total">/ 100</span>
                </span>
                <span className="KlynaScore__track">
                  <span className="KlynaScore__fill" />
                </span>
              </div>
              {priorityFinding ? (
                <div className="KlynaNextAction">
                  <span className="KlynaNextAction__label">Next best move</span>
                  <strong>{priorityFinding.title}</strong>
                  <p>{priorityFinding.action}</p>
                </div>
              ) : null}
            </div>
          </div>
        </Layout.Section>

        <Layout.Section>
          <Card padding="0">
            <div className="KlynaMetricStrip">
              {report.metrics.map((metric) => (
                <div className="KlynaMetric" key={metric.label}>
                  <span className="KlynaMetric__label">{metric.label}</span>
                  <strong
                    className={`KlynaMetric__value${metric.tone === 'critical' ? ' KlynaMetric__value--critical' : metric.tone === 'warning' ? ' KlynaMetric__value--warning' : ''}`}
                  >
                    {metric.value}
                  </strong>
                </div>
              ))}
            </div>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <div className="KlynaWorkspaceGrid">
            <Card>
              <BlockStack gap="300">
                <div className="KlynaSectionHeader">
                  <div>
                    <h2>Current findings</h2>
                    <p>{report.summary}</p>
                  </div>
                </div>
                {report.findings.map((finding) => (
                  <div key={finding.id} className="KlynaFinding" data-severity={finding.severity}>
                    <BlockStack gap="150">
                      <InlineStack align="space-between" gap="200">
                        <Text as="h3" variant="headingSm">
                          {finding.title}
                        </Text>
                        <Badge tone={badgeTone(finding.severity)}>
                          {labelFor(finding.severity)}
                        </Badge>
                      </InlineStack>
                      <Text as="p">{finding.detail}</Text>
                      {finding.evidence && (
                        <Text as="p" tone="subdued">
                          Evidence: {finding.evidence}
                        </Text>
                      )}
                      <Text as="p" tone="subdued">
                        Next step: {finding.action}
                      </Text>
                      <div className="KlynaFinding__footer">
                        <Button size="slim" url={playbookUrl}>
                          Work this fix
                        </Button>
                      </div>
                    </BlockStack>
                  </div>
                ))}
              </BlockStack>
            </Card>

            <div className="KlynaSidebar">
              <Card>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    Evidence workflow
                  </Text>
                  <Text as="p" tone="subdued">
                    {product.workspaceDescription}
                  </Text>
                  <Button url={playbookUrl}>{`Open ${product.workspaceName}`}</Button>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    Recent scans
                  </Text>
                  {history.length === 0 ? (
                    <Text as="p" tone="subdued">
                      No scan history yet.
                    </Text>
                  ) : (
                    <div className="KlynaDataRows">
                      {history.map((scan) => (
                        <div className="KlynaDataRow" key={scan.id}>
                          <span>{scan.createdAtLabel}</span>
                          <strong>{scan.score}</strong>
                        </div>
                      ))}
                    </div>
                  )}
                  <Link to={historyUrl}>View scan history</Link>
                </BlockStack>
              </Card>
            </div>
          </div>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

function startOfCurrentUtcMonth() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function downloadReport(productName: string, report: ProductReport) {
  const rows = [
    ['Product', productName],
    ['Generated at', report.generatedAt],
    ['Health score', String(report.score)],
    ['Status', report.status],
    [],
    ['Metric', 'Value'],
    ...report.metrics.map((metric) => [metric.label, metric.value]),
    [],
    ['Severity', 'Finding', 'Detail', 'Evidence', 'Next step'],
    ...report.findings.map((finding) => [
      finding.severity,
      finding.title,
      finding.detail,
      finding.evidence ?? '',
      finding.action,
    ]),
  ];
  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${productName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-report.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function csvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function badgeTone(severity: string) {
  if (severity === 'critical') return 'critical' as const;
  if (severity === 'warning') return 'warning' as const;
  if (severity === 'success') return 'success' as const;
  return 'info' as const;
}

function labelFor(value: string) {
  return value
    .split(/[-_]/)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function formatScanDate(date: Date) {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(date);
}
