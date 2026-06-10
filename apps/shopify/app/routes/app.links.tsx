import { type LoaderFunctionArgs } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { BlockStack, Card, Layout, Page, Text } from '@shopify/polaris';
import { authenticate } from '../shopify.server';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function LinksPage() {
  useLoaderData<typeof loader>();
  return (
    <Page title="Internal links" backAction={{ url: '/app' }}>
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Coming soon</Text>
              <Text as="p" tone="subdued">
                Run TF-IDF similarity across your products, collections, and content
                pages. Klyna surfaces the strongest missing internal links and (with
                your approval) injects them via theme app extension.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
