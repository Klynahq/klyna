import { type LoaderFunctionArgs } from '@remix-run/node';
import { Link, useLoaderData } from '@remix-run/react';
import {
  BlockStack,
  Card,
  InlineGrid,
  Layout,
  Page,
  Text,
} from '@shopify/polaris';
import { authenticate } from '../shopify.server';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return { shop: session.shop };
};

export default function Dashboard() {
  const { shop } = useLoaderData<typeof loader>();

  const tiles = [
    {
      title: 'Audit store',
      body: 'One-click on-page SEO + GEO audit of your storefront and top product pages.',
      to: '/app/audit',
    },
    {
      title: 'Schema markup',
      body: 'Auto-inject Product, Organization, BreadcrumbList, and FAQ schema across your store.',
      to: '/app/schema',
    },
    {
      title: 'Internal links',
      body: 'Surface missing internal links between products, collections, and content pages.',
      to: '/app/links',
    },
  ];

  return (
    <Page title="Klyna for Shopify" subtitle={`Connected to ${shop}`}>
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">Organic growth, on autopilot.</Text>
              <Text as="p" variant="bodyMd" tone="subdued">
                Klyna runs entirely on free infrastructure — no API keys, no per-page billing,
                no data leaves your store. Pick a module to get started.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
        <Layout.Section>
          <InlineGrid columns={{ xs: 1, md: 3 }} gap="300">
            {tiles.map((t) => (
              <Card key={t.to}>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingSm">{t.title}</Text>
                  <Text as="p" variant="bodyMd" tone="subdued">{t.body}</Text>
                  <Link to={t.to}>Open →</Link>
                </BlockStack>
              </Card>
            ))}
          </InlineGrid>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
