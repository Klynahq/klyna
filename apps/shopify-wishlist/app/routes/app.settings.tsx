import { type LoaderFunctionArgs } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import {
  BlockStack,
  Box,
  Card,
  InlineStack,
  Layout,
  Link as PolarisLink,
  List,
  Page,
  Text,
} from '@shopify/polaris';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  // Quick health signal: have any saves landed yet?
  const items = await prisma.wishlistItem.count({ where: { shop } });

  const themeEditorUrl = `https://${shop}/admin/themes/current/editor?context=apps`;
  const wishlistPageUrl = `https://${shop}/apps/wishlist`;

  return { shop, items, themeEditorUrl, wishlistPageUrl };
};

export default function Settings() {
  const { items, themeEditorUrl, wishlistPageUrl } = useLoaderData<typeof loader>();

  return (
    <Page title="Settings" backAction={{ url: '/app' }}>
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Add the wishlist button to your storefront</Text>
              <Text as="p" tone="subdued">
                Klyna Wishlist ships as a Theme App Extension, so there is no theme code
                to edit. Add the block in the theme editor, save, and the heart button
                appears on product and collection cards.
              </Text>
              <List type="number">
                <List.Item>
                  Open the{' '}
                  <PolarisLink url={themeEditorUrl} target="_blank">theme editor</PolarisLink>{' '}
                  (Online Store → Themes → Customize).
                </List.Item>
                <List.Item>
                  On a product template, click <b>Add block</b> → <b>Apps</b> →{' '}
                  <b>Wishlist button</b>.
                </List.Item>
                <List.Item>
                  Under <b>App embeds</b>, enable <b>Klyna Wishlist</b> to load the
                  floating drawer and guest-save script site-wide.
                </List.Item>
                <List.Item>Click <b>Save</b>. Done.</List.Item>
              </List>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Your storefront wishlist page</Text>
              <Text as="p" tone="subdued">
                Shoppers reach their full wishlist — and any shared list — through the
                App Proxy at this URL. Link to it from your header or account menu.
              </Text>
              <Box background="bg-surface-secondary" padding="200" borderRadius="200">
                <Text as="span" variant="bodyMd" breakWord>{wishlistPageUrl}</Text>
              </Box>
              <InlineStack gap="200">
                <PolarisLink url={wishlistPageUrl} target="_blank">Preview the page</PolarisLink>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">How it works</Text>
              <List type="bullet">
                <List.Item>
                  <b>Guest saves</b> are stored in the browser (localStorage) instantly —
                  no login required — then synced to the server on the next interaction.
                </List.Item>
                <List.Item>
                  <b>Logged-in saves</b> attach to the Shopify customer so the list
                  follows them across devices.
                </List.Item>
                <List.Item>
                  <b>Shareable links</b> are opt-in per list. Enable a link from the
                  Wishlists page and anyone with the URL can view (not edit) the list.
                </List.Item>
                <List.Item>
                  <b>No paid APIs.</b> Everything runs on your app host and Shopify's
                  free Admin + Storefront surfaces.
                </List.Item>
              </List>
              <Text as="p" variant="bodySm" tone={items > 0 ? 'success' : 'subdued'}>
                {items > 0
                  ? `Looks good — ${items.toLocaleString()} item${items === 1 ? '' : 's'} saved so far.`
                  : 'No saves recorded yet. Add the block and try saving a product on your storefront.'}
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
