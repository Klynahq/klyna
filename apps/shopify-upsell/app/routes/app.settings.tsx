import { type LoaderFunctionArgs } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  InlineStack,
  Layout,
  List,
  Page,
  Text,
} from '@shopify/polaris';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';

// The handle of the theme app extension (matches extensions/cart-upsell/).
const THEME_EXTENSION_HANDLE = 'klyna-upsell';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const [cartOffers, postPurchaseOffers] = await Promise.all([
    prisma.offer.count({ where: { shop: session.shop, placement: 'cart', enabled: true } }),
    prisma.offer.count({ where: { shop: session.shop, placement: 'post_purchase', enabled: true } }),
  ]);

  // Deep link into the theme editor with our app embed pre-selected.
  const storeHandle = session.shop.replace('.myshopify.com', '');
  const themeEditorUrl = `https://admin.shopify.com/store/${storeHandle}/themes/current/editor?context=apps`;

  return { shop: session.shop, cartOffers, postPurchaseOffers, themeEditorUrl };
};

export default function Settings() {
  const { shop, cartOffers, postPurchaseOffers, themeEditorUrl } = useLoaderData<typeof loader>();

  return (
    <Page title="Settings" backAction={{ url: '/app' }}>
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">In-cart widget</Text>
                <Badge tone={cartOffers > 0 ? 'success' : 'attention'}>
                  {cartOffers > 0 ? `${cartOffers} live` : 'No live cart offers'}
                </Badge>
              </InlineStack>
              <Text as="p" tone="subdued">
                The cart upsell is a theme app extension (block handle{' '}
                <code>{THEME_EXTENSION_HANDLE}</code>). Add it to your cart drawer
                or cart page in the theme editor — no theme code required. It pulls
                live offers from this app and records impressions and accepts.
              </Text>
              <List type="number">
                <List.Item>Open the theme editor.</List.Item>
                <List.Item>Go to your Cart template (or the cart drawer section).</List.Item>
                <List.Item>Click “Add block” → Apps → “Klyna Upsell”.</List.Item>
                <List.Item>Save. Live offers targeting the cart now render automatically.</List.Item>
              </List>
              <Box>
                <Button url={themeEditorUrl} target="_blank" variant="primary">
                  Open theme editor
                </Button>
              </Box>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">Post-purchase offer</Text>
                <Badge tone={postPurchaseOffers > 0 ? 'success' : 'attention'}>
                  {postPurchaseOffers > 0 ? `${postPurchaseOffers} live` : 'Not configured'}
                </Badge>
              </InlineStack>
              <Text as="p" tone="subdued">
                Post-purchase offers appear on the thank-you / order-status page
                via a Checkout UI extension. The extension scaffold ships in{' '}
                <code>extensions/post-purchase/</code>. Activate it in{' '}
                <strong>Settings → Checkout → Post-purchase page</strong> and
                select “Klyna Upsell”.
              </Text>
              <List type="bullet">
                <List.Item>One-click acceptance with no re-entry of payment.</List.Item>
                <List.Item>Honors the same offer rules and A/B split as the cart widget.</List.Item>
                <List.Item>Accepted offers are attributed to the order automatically.</List.Item>
              </List>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">Connection</Text>
              <Text as="p" tone="subdued">Store</Text>
              <Text as="p" variant="bodyMd">{shop}</Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Storefront API endpoint: <code>/api/offers</code> (app proxy / fetched
                by the theme block). No customer data leaves your store beyond what
                Shopify already exposes to the cart.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
