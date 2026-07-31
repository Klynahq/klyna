import { type LoaderFunctionArgs, json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { Badge, Banner, BlockStack, Button, Card, IndexTable, Page, Text } from '@shopify/polaris';
import prisma from '../db.server';
import { useEmbeddedRoute } from '../lib/embedded-routes';
import { getProductKey, products, toneForStatus } from '../lib/products';
import { STARTER_PLAN, authenticate, isBillingTest } from '../shopify.server';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, billing } = await authenticate.admin(request);
  const productKey = getProductKey();
  let hasActivePayment = false;

  try {
    const billingCheck = await billing.check({
      plans: [STARTER_PLAN],
      isTest: isBillingTest(),
    });
    hasActivePayment = billingCheck.hasActivePayment;
  } catch (error) {
    console.error('Billing check failed on history; showing free history.', error);
  }

  const scans = await prisma.diagnosticScan.findMany({
    where: { shop: session.shop, productKey },
    orderBy: { createdAt: 'desc' },
    take: hasActivePayment ? 50 : 1,
  });

  return json({
    product: products[productKey],
    hasActivePayment,
    scans: scans.map((scan) => ({
      id: scan.id,
      score: scan.score,
      status: scan.status,
      summary: scan.summary,
      createdAtLabel: formatScanDate(scan.createdAt),
    })),
  });
};

export default function History() {
  const { product, scans, hasActivePayment } = useLoaderData<typeof loader>();
  const billingUrl = useEmbeddedRoute('/app/billing');

  return (
    <Page title={`${product.name} history`}>
      <BlockStack gap="400">
        {!hasActivePayment ? (
          <Banner tone="info" title="Free plan shows your latest check">
            <BlockStack gap="200">
              <Text as="p">Upgrade to Pro for up to 50 historical checks and CSV exports.</Text>
              <Button url={billingUrl}>Compare plans</Button>
            </BlockStack>
          </Banner>
        ) : null}
        <Card>
          {scans.length === 0 ? (
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">
                No scans yet
              </Text>
              <Text as="p" tone="subdued">
                Run your first scan from the dashboard.
              </Text>
            </BlockStack>
          ) : (
            <IndexTable
              resourceName={{ singular: 'scan', plural: 'scans' }}
              itemCount={scans.length}
              headings={[
                { title: 'Date' },
                { title: 'Score' },
                { title: 'Status' },
                { title: 'Summary' },
              ]}
              selectable={false}
            >
              {scans.map((scan, index) => (
                <IndexTable.Row id={scan.id} key={scan.id} position={index}>
                  <IndexTable.Cell>{scan.createdAtLabel}</IndexTable.Cell>
                  <IndexTable.Cell>{scan.score}</IndexTable.Cell>
                  <IndexTable.Cell>
                    <Badge tone={toneForStatus(scan.status as never)}>{scan.status}</Badge>
                  </IndexTable.Cell>
                  <IndexTable.Cell>{scan.summary}</IndexTable.Cell>
                </IndexTable.Row>
              ))}
            </IndexTable>
          )}
        </Card>
      </BlockStack>
    </Page>
  );
}

function formatScanDate(date: Date) {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(date);
}
