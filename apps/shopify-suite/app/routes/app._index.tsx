import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/node';
import { Form, Link, useLoaderData, useNavigation } from '@remix-run/react';
import { Badge, BlockStack, Button, Card, InlineStack, Layout, Page, Text } from '@shopify/polaris';
import type { CSSProperties } from 'react';
import prisma from '../db.server';
import { useEmbeddedRoute } from '../lib/embedded-routes';
import { type ProductReport, getProductKey, products, toneForStatus } from '../lib/products';
import { buildReport } from '../lib/scanners.server';
import { getShopSnapshot } from '../lib/shopify-data.server';
import { authenticate } from '../shopify.server';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const productKey = getProductKey();
  const product = products[productKey];
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
    await saveReport(session.shop, report);
  }

  const history = await prisma.diagnosticScan.findMany({
    where: { shop: session.shop, productKey },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  return json({
    shop: session.shop,
    product,
    report,
    history: history.map((scan) => ({
      id: scan.id,
      score: scan.score,
      status: scan.status,
      createdAtLabel: formatScanDate(scan.createdAt),
    })),
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const productKey = getProductKey();
  const snapshot = await getShopSnapshot(admin, productKey);
  const report = await buildReport(productKey, snapshot);
  await saveReport(session.shop, report);
  return json({ ok: true });
};

async function saveReport(shop: string, report: ProductReport) {
  await prisma.diagnosticScan.create({
    data: {
      shop,
      productKey: report.productKey,
      score: report.score,
      status: report.status,
      summary: report.summary,
      metrics: JSON.stringify(report.metrics),
      findings: JSON.stringify(report.findings),
    },
  });
}

export default function Dashboard() {
  const { shop, product, report, history } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isRunning = navigation.state !== 'idle';
  const historyUrl = useEmbeddedRoute('/app/history');
  const playbookUrl = useEmbeddedRoute('/app/playbook');
  const workspaceLabel =
    product.key === 'redirect-guard' ? 'Open redirect workspace' : 'Open operating guide';

  return (
    <Page title={product.name} subtitle={shop}>
      <Layout>
        <Layout.Section>
          <div className="KlynaDashboardLead">
            <div className="KlynaDashboardLead__copy">
              <InlineStack gap="200" blockAlign="center">
                <p className="KlynaEyebrow">Latest store check</p>
                <Badge tone={toneForStatus(report.status)}>{labelFor(report.status)}</Badge>
              </InlineStack>
              <h2 className="KlynaLeadTitle">{product.tagline}</h2>
              <p className="KlynaLeadBody">{product.outcome}</p>
              <div className="KlynaActions">
                <Form method="post">
                  <Button submit variant="primary" loading={isRunning}>
                    {product.primaryAction}
                  </Button>
                </Form>
                <Button url={playbookUrl}>{workspaceLabel}</Button>
              </div>
            </div>
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
                    </BlockStack>
                  </div>
                ))}
              </BlockStack>
            </Card>

            <div className="KlynaSidebar">
              <Card>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    Monitoring and exports
                  </Text>
                  <Text as="p" tone="subdued">
                    {product.paidValue}
                  </Text>
                  <Button url="/app/billing">Review plan</Button>
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
