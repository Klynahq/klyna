import { type LoaderFunctionArgs } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { BlockStack, Card, Layout, List, Page, Text } from '@shopify/polaris';
import { authenticate } from '../shopify.server';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function SchemaPage() {
  useLoaderData<typeof loader>();
  return (
    <Page title="Schema markup" backAction={{ url: '/app' }}>
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Coming soon</Text>
              <Text as="p" tone="subdued">
                Auto-inject Product, Organization, BreadcrumbList, and FAQ schema
                across your storefront theme.
              </Text>
              <List type="bullet">
                <List.Item>Product schema with price, availability, ratings</List.Item>
                <List.Item>Collection BreadcrumbList</List.Item>
                <List.Item>FAQPage on policy / FAQ pages</List.Item>
                <List.Item>Organization + WebSite sitewide</List.Item>
              </List>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
