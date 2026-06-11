import { type LoaderFunctionArgs, json } from '@remix-run/node';
import { Link, useLoaderData } from '@remix-run/react';
import {
  Badge,
  BlockStack,
  Box,
  Card,
  InlineGrid,
  InlineStack,
  Layout,
  Link as PolarisLink,
  List,
  Page,
  Text,
} from '@shopify/polaris';
import { authenticate } from '../shopify.server';
import { getSettings } from '../models/settings.server';
import { getSummary } from '../models/analytics.server';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  const settings = await getSettings(session.shop);
  const summary = await getSummary(session.shop, 30);

  // Light connectivity check — confirm the Admin API works and grab the store
  // name + currency to label the dashboard. Failure here is non-fatal.
  let shopName = session.shop;
  let currency = 'USD';
  try {
    const res = await admin.graphql(
      `#graphql
      query StickyCartShopInfo {
        shop { name currencyCode }
      }`,
    );
    const body = (await res.json()) as {
      data?: { shop?: { name?: string; currencyCode?: string } };
    };
    shopName = body.data?.shop?.name ?? shopName;
    currency = body.data?.shop?.currencyCode ?? currency;
  } catch {
    // ignore — dashboard still renders with the shop domain
  }

  return json({ shop: session.shop, shopName, currency, settings, summary });
};

export default function Dashboard() {
  const { shop, shopName, currency, settings, summary } = useLoaderData<typeof loader>();

  const fmt = new Intl.NumberFormat(undefined, { style: 'currency', currency });
  const num = new Intl.NumberFormat();

  const stats = [
    { label: 'Bar impressions (30d)', value: num.format(summary.totals.impression) },
    { label: 'Add-to-cart clicks', value: num.format(summary.totals.atc) },
    { label: 'Add-to-cart rate', value: `${summary.atcRate}%` },
    { label: 'Quick-buy clicks', value: num.format(summary.totals.quickbuy) },
  ];

  const setupSteps = [
    {
      done: settings.enabled,
      text: settings.enabled
        ? 'Sticky bar is enabled'
        : 'Enable the sticky bar in Sticky bar settings',
    },
    {
      done: settings.freeShipEnabled,
      text: settings.freeShipEnabled
        ? `Free-shipping bar on at ${fmt.format(settings.freeShipThreshold)}`
        : 'Turn on the free-shipping progress bar',
    },
    {
      done: false,
      text: 'Add the "Klyna Sticky Cart" app embed in your theme editor (Online Store → Themes → Customize → App embeds)',
    },
  ];

  return (
    <Page
      title="Klyna Sticky Cart"
      subtitle={`Connected to ${shopName}`}
      titleMetadata={
        settings.enabled ? <Badge tone="success">Live</Badge> : <Badge>Paused</Badge>
      }
    >
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">
                Never lose the add-to-cart button.
              </Text>
              <Text as="p" variant="bodyMd" tone="subdued">
                A persistent add-to-cart bar follows shoppers down the product page —
                with variant + quantity selection, one-tap quick-buy, and a
                free-shipping progress bar that nudges bigger carts. Everything runs
                from a theme app embed; no theme code to edit.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <InlineGrid columns={{ xs: 2, md: 4 }} gap="300">
            {stats.map((s) => (
              <Card key={s.label}>
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">{s.label}</Text>
                  <Text as="p" variant="headingLg" fontWeight="bold">{s.value}</Text>
                </BlockStack>
              </Card>
            ))}
          </InlineGrid>
        </Layout.Section>

        <Layout.Section>
          <InlineGrid columns={{ xs: 1, md: 3 }} gap="300">
            <Card>
              <BlockStack gap="200">
                <Text as="h3" variant="headingSm">Sticky bar</Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  Position, what shows in the bar, the call-to-action label and colors,
                  and quick-buy.
                </Text>
                <Link to="/app/settings">Edit bar →</Link>
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="200">
                <Text as="h3" variant="headingSm">Free shipping</Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  Set the threshold and the progress-bar copy. Shoppers see how far they
                  are from free delivery in real time.
                </Text>
                <Link to="/app/free-shipping">Set threshold →</Link>
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="200">
                <Text as="h3" variant="headingSm">Analytics</Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  Impressions, add-to-cart rate, quick-buy clicks, and your best-converting
                  products from the bar.
                </Text>
                <Link to="/app/analytics">View analytics →</Link>
              </BlockStack>
            </Card>
          </InlineGrid>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">Setup checklist</Text>
                <Text as="span" variant="bodySm" tone="subdued">{shop}</Text>
              </InlineStack>
              <List type="bullet">
                {setupSteps.map((step) => (
                  <List.Item key={step.text}>
                    <InlineStack gap="150" blockAlign="center">
                      <Badge tone={step.done ? 'success' : 'attention'}>
                        {step.done ? 'Done' : 'To do'}
                      </Badge>
                      <Text as="span">{step.text}</Text>
                    </InlineStack>
                  </List.Item>
                ))}
              </List>
              <Box>
                <Text as="p" variant="bodySm" tone="subdued">
                  The bar renders through a Theme App Extension. Activate the
                  “Klyna Sticky Cart” app embed once and it appears on every product
                  page automatically.{' '}
                  <PolarisLink url="https://help.shopify.com/manual/online-store/themes/theme-structure/extend/apps" external>
                    Learn about app embeds
                  </PolarisLink>
                </Text>
              </Box>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
