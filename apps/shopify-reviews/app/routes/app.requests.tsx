import { type LoaderFunctionArgs } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { Badge, BlockStack, Card, Layout, Page, Text } from '@shopify/polaris';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';
import { useEmbeddedRoute } from '../lib/embedded-routes';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const savedRequestCount = await prisma.reviewRequest.count({ where: { shop: session.shop } });
  return { savedRequestCount };
};

export default function Requests() {
  const embeddedRoute = useEmbeddedRoute();
  const { savedRequestCount } = useLoaderData<typeof loader>();

  return (
    <Page
      title="Review requests"
      subtitle="Approval-gated buyer email automation"
      backAction={{ url: embeddedRoute('/app') }}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Badge tone="info">Launch-safe mode</Badge>
              <Text as="h2" variant="headingMd">Buyer email automation is paused</Text>
              <Text as="p" tone="subdued">
                Klyna Reviews launches with storefront review collection, moderation,
                review widgets, aggregate-rating metafields, analytics, and optional
                AI summaries. Automatic post-fulfillment buyer emails require Shopify
                protected customer data approval, so they are not active in this build.
              </Text>
              <Text as="p" tone="subdued">
                Saved request records: {savedRequestCount}. Existing records stay in
                the database for future protected-data approval, but this app version
                does not read Shopify orders or customers.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
