import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/node';
import { Form, Link, useLoaderData, useNavigation } from '@remix-run/react';
import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  Divider,
  InlineGrid,
  InlineStack,
  Layout,
  List,
  Page,
  Text,
} from '@shopify/polaris';
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

  return (
    <Page title={product.name} subtitle={shop}>
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center" gap="400">
                <BlockStack gap="200">
                  <InlineStack gap="200" blockAlign="center">
                    <Text as="h2" variant="headingLg">
                      {product.tagline}
                    </Text>
                    <Badge tone={toneForStatus(report.status)}>{report.status}</Badge>
                  </InlineStack>
                  <Text as="p" tone="subdued">
                    {product.outcome}
                  </Text>
                  <InlineStack gap="300">
                    <Form method="post">
                      <Button submit variant="primary" loading={isRunning}>
                        {product.primaryAction}
                      </Button>
                    </Form>
                    <Button url={playbookUrl}>
                      {product.key === 'redirect-guard' ? 'Open redirect workspace' : 'Open operating guide'}
                    </Button>
                  </InlineStack>
                </BlockStack>
                <div
                  className="KlynaScore"
                  style={{ '--score': report.score } as React.CSSProperties}
                >
                  <strong>{report.score}</strong>
                </div>
              </InlineStack>

              <Divider />

              <InlineGrid columns={{ xs: 2, md: 4 }} gap="300">
                {report.metrics.map((metric) => (
                  <Box
                    key={metric.label}
                    padding="300"
                    borderColor="border"
                    borderWidth="025"
                    borderRadius="200"
                  >
                    <BlockStack gap="100">
                      <Text as="span" variant="bodySm" tone="subdued">
                        {metric.label}
                      </Text>
                      <InlineStack gap="150" blockAlign="center">
                        <Text as="strong" variant="headingLg">
                          {metric.value}
                        </Text>
                        {metric.tone && <Badge tone={metric.tone}>{metric.tone}</Badge>}
                      </InlineStack>
                    </BlockStack>
                  </Box>
                ))}
              </InlineGrid>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <InlineGrid columns={{ xs: 1, lg: 3 }} gap="400">
            <div style={{ gridColumn: 'span 2' }}>
              <Card>
                <BlockStack gap="300">
                  <BlockStack gap="100">
                    <Text as="h2" variant="headingMd">
                      Current findings
                    </Text>
                    <Text as="p" tone="subdued">
                      {report.summary}
                    </Text>
                  </BlockStack>
                  {report.findings.map((finding) => (
                    <div key={finding.id} className="KlynaFinding" data-severity={finding.severity}>
                      <BlockStack gap="150">
                        <InlineStack align="space-between" gap="200">
                          <Text as="h3" variant="headingSm">
                            {finding.title}
                          </Text>
                          <Badge tone={badgeTone(finding.severity)}>{finding.severity}</Badge>
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
            </div>

            <BlockStack gap="400">
              <Card>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    Paid value
                  </Text>
                  <Text as="p" tone="subdued">
                    {product.paidValue}
                  </Text>
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
                    <List type="bullet">
                      {history.map((scan) => (
                        <List.Item key={scan.id}>
                          {scan.score} on {scan.createdAtLabel}
                        </List.Item>
                      ))}
                    </List>
                  )}
                  <Link to={historyUrl}>Open full history</Link>
                </BlockStack>
              </Card>
            </BlockStack>
          </InlineGrid>
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

function formatScanDate(date: Date) {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(date);
}
