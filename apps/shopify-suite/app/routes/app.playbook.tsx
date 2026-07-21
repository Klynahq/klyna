import { type LoaderFunctionArgs, json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { BlockStack, Card, InlineGrid, Layout, List, Page, Text } from '@shopify/polaris';
import { getProductKey, products } from '../lib/products';
import { authenticate } from '../shopify.server';

const playbooks = {
  cleanroom: [
    'Duplicate the live theme before editing any old app code.',
    'Remove only snippets with clear source evidence and no matching installed app.',
    'Check homepage, product page, cart, and checkout handoff after cleanup.',
    'Record before/after script count and keep rollback notes for support.',
  ],
  'promo-qa': [
    'Build launch scenarios for top products, markets, and customer tags.',
    'Test code discounts against automatic discounts and free-shipping thresholds.',
    'Mark unsupported stacking as expected behavior before support tickets arrive.',
    'Set discount expiry dates and margin guardrails before paid traffic starts.',
  ],
  'redirect-guard': [
    'Export current product, collection, and page URLs before migrations.',
    'Create redirects for any deleted URL with organic traffic, backlinks, or campaign use.',
    'Check redirects after theme launches and bulk product changes.',
    'Keep redirect maps small, direct, and pointed to canonical live URLs.',
  ],
  'pixel-doctor': [
    'Choose a single source of truth for each ad platform.',
    'Remove hardcoded pixels only after Customer Events or native integrations are verified.',
    'Confirm consent signals load before marketing tags for regulated markets.',
    'Check event IDs and product IDs in each ad platform after changes.',
  ],
  'feed-doctor': [
    'Fix missing GTIN/barcode, brand, image, and SKU before scaling Shopping ads.',
    'Use metafields for channel-specific product titles and descriptions.',
    'Separate custom products from manufactured products in feed settings.',
    'Run diagnostics after imports, vendor uploads, and product launches.',
  ],
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const productKey = getProductKey();
  return json({ product: products[productKey], steps: playbooks[productKey] });
};

export default function Playbook() {
  const { product, steps } = useLoaderData<typeof loader>();

  return (
    <Page title={`${product.name} fix playbook`} subtitle={product.listingPositioning}>
      <Layout>
        <Layout.Section>
          <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  Safe operating rules
                </Text>
                <List type="bullet">
                  {steps.map((step) => (
                    <List.Item key={step}>{step}</List.Item>
                  ))}
                </List>
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  What makes this App Store-ready
                </Text>
                <Text as="p" tone="subdued">
                  The app starts with read-mostly diagnostics, shows evidence, stores scan history,
                  and avoids silent destructive changes. Paid workflows can add monitoring, exports,
                  and guarded fix queues without surprising merchants.
                </Text>
              </BlockStack>
            </Card>
          </InlineGrid>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
