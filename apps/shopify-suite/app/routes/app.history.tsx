import { type LoaderFunctionArgs, json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { Badge, Banner, BlockStack, Card, IndexTable, Page, Text } from '@shopify/polaris';
import prisma from '../db.server';
import { getActiveBillingState } from '../lib/billing-plans';
import { getProductKey, products, toneForStatus } from '../lib/products';
import { authenticate, isBillingTest } from '../shopify.server';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin, billing } = await authenticate.admin(request);
  const productKey = getProductKey();
  let hasActivePayment = false;

  try {
    const billingState = await getActiveBillingState(admin, billing, isBillingTest());
    hasActivePayment = billingState.hasActivePayment;
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

  return (
    <Page title={`${product.name} history`}>
      <BlockStack gap="400">
        {!hasActivePayment ? (
          <Banner tone="info" title="Latest scan evidence">
            <Text as="p">
              Review the most recent completed scan below and rerun it after theme or app changes.
            </Text>
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
