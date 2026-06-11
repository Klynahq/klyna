import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/node';
import { Form, useActionData, useLoaderData, useNavigation } from '@remix-run/react';
import { useState } from 'react';
import {
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  InlineStack,
  Layout,
  Link,
  Page,
  Text,
  TextField,
} from '@shopify/polaris';
import { authenticate } from '../shopify.server';
import { getShopAiSettings } from '../lib/ai.server';
import { generateRecoverLine } from '../lib/recover.server';
import { getSettings } from '../models/settings.server';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const ai = await getShopAiSettings(session.shop);
  const settings = await getSettings(session.shop);
  return json({
    aiEnabled: ai.provider !== 'off' && !!ai.apiKey,
    provider: ai.provider,
    freeShipEnabled: settings.freeShipEnabled,
    freeShipThreshold: settings.freeShipThreshold,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const title = String(form.get('title') ?? 'Demo product').slice(0, 80);
  const quantity = Math.max(1, Math.min(10, Number(form.get('quantity') ?? 1) || 1));
  const cartTotal = Math.max(0, Number(form.get('cartTotal') ?? 0) || 0);
  const visitCount = Math.max(1, Math.min(20, Number(form.get('visitCount') ?? 1) || 1));

  const settings = await getSettings(session.shop);
  const result = await generateRecoverLine({
    shop: session.shop,
    lines: [{ title, quantity }],
    cartTotal,
    visitCount,
    freeShipThreshold: settings.freeShipEnabled ? settings.freeShipThreshold : 0,
  });
  return json({ result });
};

export default function Recover() {
  const { aiEnabled, provider, freeShipEnabled, freeShipThreshold } = useLoaderData<typeof loader>();
  const data = useActionData<typeof action>();
  const nav = useNavigation();
  const submitting = nav.state === 'submitting';

  const [title, setTitle] = useState('Charcoal canvas tote');
  const [quantity, setQuantity] = useState('1');
  const [cartTotal, setCartTotal] = useState('55');
  const [visitCount, setVisitCount] = useState('2');

  const result = data?.result;

  return (
    <Page title="Cart recovery" backAction={{ url: '/app' }}>
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <BlockStack gap="100">
                <Text as="h2" variant="headingMd">AI cart-recovery one-liner</Text>
                <Text as="p" tone="subdued">
                  A short message at the top of the sticky cart that varies its angle based on
                  the cart: close to the free-shipping threshold, returning visitor, or just a
                  gentle reminder. Cached per cart for one hour so repeat views do not burn the
                  daily AI quota.
                </Text>
              </BlockStack>
              {!aiEnabled && (
                <Banner tone="warning" title="Enable AI in Settings">
                  <Text as="p" variant="bodyMd">
                    The cart-recovery line uses AI. Pick a free-tier provider on the{' '}
                    <Link url="/app/ai">AI assistant</Link> page first.
                  </Text>
                </Banner>
              )}
              {aiEnabled && (
                <Text as="p" tone="subdued" variant="bodySm">
                  Provider: {provider}. Free shipping threshold:{' '}
                  {freeShipEnabled ? freeShipThreshold : 'off'}.
                </Text>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <Form method="post">
              <BlockStack gap="300">
                <Text as="h3" variant="headingSm">Preview a cart</Text>
                <TextField
                  label="Product title"
                  value={title}
                  onChange={setTitle}
                  name="title"
                  autoComplete="off"
                />
                <InlineStack gap="300" wrap={false}>
                  <Box minWidth="120px">
                    <TextField
                      label="Quantity"
                      type="number"
                      value={quantity}
                      onChange={setQuantity}
                      name="quantity"
                      autoComplete="off"
                      min={1}
                      max={10}
                    />
                  </Box>
                  <Box minWidth="160px">
                    <TextField
                      label="Cart total"
                      type="number"
                      value={cartTotal}
                      onChange={setCartTotal}
                      name="cartTotal"
                      autoComplete="off"
                      min={0}
                    />
                  </Box>
                  <Box minWidth="140px">
                    <TextField
                      label="Visit count"
                      type="number"
                      value={visitCount}
                      onChange={setVisitCount}
                      name="visitCount"
                      autoComplete="off"
                      min={1}
                      max={20}
                    />
                  </Box>
                </InlineStack>
                <InlineStack>
                  <Button submit variant="primary" loading={submitting} disabled={!aiEnabled}>
                    Generate line
                  </Button>
                </InlineStack>
              </BlockStack>
            </Form>
          </Card>
        </Layout.Section>

        {result && (
          <Layout.Section>
            {result.error ? (
              <Banner tone="critical" title="AI error">
                <Text as="p" variant="bodyMd">{result.error}</Text>
              </Banner>
            ) : (
              <Card>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingSm">Generated line</Text>
                  <Banner tone="info">
                    <Text as="p" variant="bodyMd">{result.message || '(empty)'}</Text>
                  </Banner>
                  <Text as="p" tone="subdued" variant="bodySm">
                    Angle: {result.angle}. {result.cached ? 'Served from cache.' : 'Fresh call.'}
                  </Text>
                </BlockStack>
              </Card>
            )}
          </Layout.Section>
        )}
      </Layout>
    </Page>
  );
}
