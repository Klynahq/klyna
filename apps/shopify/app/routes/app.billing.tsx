import { type LoaderFunctionArgs, json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import {
  Badge,
  Banner,
  BlockStack,
  Button,
  Card,
  InlineStack,
  Layout,
  List,
  Page,
  Text,
} from '@shopify/polaris';
import { authenticate } from '../shopify.server';

const APP_HANDLE = 'klyna-seo-clean';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const storeHandle = session.shop.replace(/\.myshopify\.com$/i, '');
  const pricingUrl = `https://admin.shopify.com/store/${encodeURIComponent(
    storeHandle,
  )}/charges/${APP_HANDLE}/pricing_plans`;

  return json({ pricingUrl });
};

export default function Billing() {
  const { pricingUrl } = useLoaderData<typeof loader>();

  return (
    <Page
      title="Billing and plans"
      subtitle="Choose the plan that fits your store. Shopify securely manages every subscription."
      backAction={{ url: '/app' }}
    >
      <Layout>
        <Layout.Section>
          <Banner tone="info" title="Billing is managed by Shopify">
            <Text as="p">
              You can start a trial, change your billing cycle, or cancel from Shopify admin. Klyna
              never receives your payment details.
            </Text>
          </Banner>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="500">
              <InlineStack align="space-between" blockAlign="center" gap="300">
                <BlockStack gap="100">
                  <InlineStack gap="200" blockAlign="center">
                    <Text as="h2" variant="headingLg">
                      Growth
                    </Text>
                    <Badge tone="success">7-day free trial</Badge>
                  </InlineStack>
                  <Text as="p" tone="subdued">
                    Complete SEO auditing and optimization for growing Shopify stores.
                  </Text>
                </BlockStack>
                <BlockStack gap="050" inlineAlign="end">
                  <Text as="p" variant="headingXl">
                    $29 USD
                  </Text>
                  <Text as="p" tone="subdued">
                    per month
                  </Text>
                </BlockStack>
              </InlineStack>

              <Text as="p">Or $290 USD yearly, saving $58 compared with monthly billing.</Text>

              <List type="bullet">
                <List.Item>Full-store SEO scans across products, collections, and pages</List.Item>
                <List.Item>Bulk title, description, and image alt-text workflows</List.Item>
                <List.Item>Schema, canonical, internal-link, and Core Web Vitals audits</List.Item>
                <List.Item>
                  Keyword, competitor, and generative-engine visibility analysis
                </List.Item>
                <List.Item>Scan history and prioritized recommendations</List.Item>
              </List>

              <InlineStack gap="300" blockAlign="center">
                <Button url={pricingUrl} target="_top" variant="primary">
                  Start free trial
                </Button>
                <Text as="p" tone="subdued">
                  No charge for 7 days. Cancel anytime in Shopify admin.
                </Text>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">
                Manage your subscription
              </Text>
              <Text as="p" tone="subdued">
                Open Shopify's plan selector to view your current plan, switch between monthly and
                yearly billing, or manage an existing subscription.
              </Text>
              <InlineStack>
                <Button url={pricingUrl} target="_top">
                  View plan in Shopify
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
