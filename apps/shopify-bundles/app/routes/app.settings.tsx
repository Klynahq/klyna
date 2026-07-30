import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import {
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  Checkbox,
  Divider,
  InlineStack,
  Layout,
  Link,
  Page,
  Select,
  Text,
  TextField,
} from '@shopify/polaris';
import { useState } from 'react';
import { type AiProvider, createAiClient } from '~/lib/klyna-ai-client';
import { getShopAiSettings, getTodayUsage, saveShopAiSettings } from '../lib/ai.server';
import { useAuthenticatedAction } from '../lib/authenticated-action';
import { useEmbeddedRoute } from '../lib/embedded-routes';
import { getSettings, updateSettings } from '../lib/settings.server';
import { authenticate } from '../shopify.server';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const settings = await getSettings(session.shop);
  const aiSettings = await getShopAiSettings(session.shop);
  const usedToday = await getTodayUsage(session.shop);
  return { settings, aiSettings, usedToday };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get('intent') ?? 'save');

  if (intent === 'test') {
    const provider = String(form.get('provider') ?? 'off') as AiProvider;
    const apiKey = String(form.get('apiKey') ?? '').trim() || undefined;
    const model = String(form.get('model') ?? '').trim() || undefined;
    const client = createAiClient({ provider, apiKey, model });
    const result = await client.test();
    return json({ test: result });
  }

  if (intent === 'saveAi') {
    const provider = String(form.get('provider') ?? 'off') as AiProvider;
    const apiKey = String(form.get('apiKey') ?? '').trim() || undefined;
    const model = String(form.get('model') ?? '').trim() || undefined;
    const dailyCap = Math.max(1, Math.min(10000, Number(form.get('dailyCap') ?? 100) || 100));
    await saveShopAiSettings(session.shop, { provider, apiKey, model, dailyCap });
    return json({ savedAi: true });
  }

  await updateSettings(session.shop, {
    defaultDiscountType: String(form.get('defaultDiscountType') ?? 'percentage'),
    priceDisplay: String(form.get('priceDisplay') ?? 'total'),
    widgetHeading: String(form.get('widgetHeading') ?? '').slice(0, 80),
    bundleHeading: String(form.get('bundleHeading') ?? '').slice(0, 80),
    accentColor: String(form.get('accentColor') ?? '#7c5cff'),
    showSavingsBadge: form.get('showSavingsBadge') === 'on',
    autoFbt: form.get('autoFbt') === 'on',
  });

  return json({ ok: true });
};

const PROVIDER_OPTIONS = [
  { label: 'Off - no AI assistance', value: 'off' },
  { label: 'OpenRouter (free models, indefinite)', value: 'openrouter' },
  { label: 'Groq (2k/day free)', value: 'groq' },
  { label: 'Google Gemini (1.5k/day free)', value: 'gemini' },
];

const PROVIDER_HELP: Record<string, { url: string; hint: string }> = {
  openrouter: {
    url: 'https://openrouter.ai/keys',
    hint: 'Free models like Llama 3.3 70B work great. Look for the ":free" suffix.',
  },
  groq: {
    url: 'https://console.groq.com/keys',
    hint: 'Fastest free tier - around 2,000 requests/day. Default: llama-3.3-70b-versatile.',
  },
  gemini: {
    url: 'https://aistudio.google.com/apikey',
    hint: '1,500 free requests/day on gemini-2.0-flash. Best for nuance.',
  },
};

export default function Settings() {
  const { settings, aiSettings, usedToday } = useLoaderData<typeof loader>();
  const embeddedRoute = useEmbeddedRoute();
  const storefrontAction = useAuthenticatedAction<{ ok: boolean }>();
  const aiAction = useAuthenticatedAction<{ savedAi: boolean }>();
  const testAction = useAuthenticatedAction<{ test: { ok: boolean; message: string } }>();
  const saving = storefrontAction.loading;
  const testing = testAction.loading;

  const [defaultDiscountType, setDefaultDiscountType] = useState(settings.defaultDiscountType);
  const [priceDisplay, setPriceDisplay] = useState(settings.priceDisplay);
  const [widgetHeading, setWidgetHeading] = useState(settings.widgetHeading);
  const [bundleHeading, setBundleHeading] = useState(settings.bundleHeading);
  const [accentColor, setAccentColor] = useState(settings.accentColor);
  const [showSavingsBadge, setShowSavingsBadge] = useState(settings.showSavingsBadge);

  const [provider, setProvider] = useState<string>(aiSettings.provider);
  const [apiKey, setApiKey] = useState(aiSettings.apiKey ?? '');
  const [model, setModel] = useState(aiSettings.model ?? '');
  const [dailyCap, setDailyCap] = useState(String(aiSettings.dailyCap));

  const testResult = testAction.data?.test ?? null;
  const savedAi = aiAction.data?.savedAi ?? false;
  const savedStorefront = storefrontAction.data?.ok ?? false;
  const help = PROVIDER_HELP[provider];

  const save = () => {
    const fd = new FormData();
    fd.set('intent', 'save');
    fd.set('defaultDiscountType', defaultDiscountType);
    fd.set('priceDisplay', priceDisplay);
    fd.set('widgetHeading', widgetHeading);
    fd.set('bundleHeading', bundleHeading);
    fd.set('accentColor', accentColor);
    if (showSavingsBadge) fd.set('showSavingsBadge', 'on');
    void storefrontAction.submit(embeddedRoute('/app/settings'), fd);
  };

  const runTest = () => {
    const fd = new FormData();
    fd.set('intent', 'test');
    fd.set('provider', provider);
    fd.set('apiKey', apiKey);
    fd.set('model', model);
    fd.set('dailyCap', dailyCap);
    void testAction.submit(embeddedRoute('/app/settings'), fd);
  };

  const saveAi = () => {
    const fd = new FormData();
    fd.set('intent', 'saveAi');
    fd.set('provider', provider);
    fd.set('apiKey', apiKey);
    fd.set('model', model);
    fd.set('dailyCap', dailyCap);
    void aiAction.submit(embeddedRoute('/app/settings'), fd);
  };

  return (
    <Page
      title="Settings"
      backAction={{ url: embeddedRoute('/app') }}
      primaryAction={{ content: 'Save storefront settings', loading: saving, onAction: save }}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Discount defaults
              </Text>
              <Select
                label="Default discount type for new offers"
                options={[
                  { label: 'Percentage off', value: 'percentage' },
                  { label: 'Fixed amount off', value: 'fixed_amount' },
                ]}
                value={defaultDiscountType}
                onChange={setDefaultDiscountType}
              />
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Storefront display
              </Text>
              <Select
                label="Bundle price display"
                helpText="How the discounted price is shown in the product-page block."
                options={[
                  { label: 'Single total - one bundle price', value: 'total' },
                  { label: 'Stacked - strikethrough per item', value: 'stacked' },
                ]}
                value={priceDisplay}
                onChange={setPriceDisplay}
              />
              <TextField
                label="Frequently-bought-together heading"
                value={widgetHeading}
                onChange={setWidgetHeading}
                autoComplete="off"
                maxLength={80}
              />
              <TextField
                label="Bundle heading"
                value={bundleHeading}
                onChange={setBundleHeading}
                autoComplete="off"
                maxLength={80}
              />
              <Divider />
              <InlineStack gap="300" blockAlign="center">
                <TextField
                  label="Accent color"
                  value={accentColor}
                  onChange={setAccentColor}
                  autoComplete="off"
                  helpText="Used for the savings badge and add-to-cart button in the block."
                />
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 8,
                    border: '1px solid var(--p-color-border)',
                    background: accentColor,
                  }}
                  aria-hidden
                />
              </InlineStack>
              <Checkbox
                label="Show savings badge"
                checked={showSavingsBadge}
                onChange={setShowSavingsBadge}
              />
              {storefrontAction.error && (
                <Banner tone="critical" title="Storefront settings could not be saved">
                  {storefrontAction.error}
                </Banner>
              )}
              {savedStorefront && <Banner tone="success" title="Storefront settings saved" />}
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <BlockStack gap="100">
                <Text as="h2" variant="headingMd">
                  AI assistant
                </Text>
                <Text as="p" tone="subdued">
                  Add a free-tier API key below for future AI-assisted copy and bundle naming.
                  Order-history suggestions stay disabled until protected customer data access is
                  approved in Shopify.
                </Text>
              </BlockStack>

              <div>
                <BlockStack gap="300">
                  <Select
                    label="Provider"
                    options={PROVIDER_OPTIONS}
                    value={provider}
                    onChange={setProvider}
                    name="provider"
                  />

                  {provider !== 'off' && (
                    <>
                      <TextField
                        label="API key"
                        type="password"
                        value={apiKey}
                        onChange={setApiKey}
                        name="apiKey"
                        autoComplete="off"
                        helpText={
                          help ? (
                            <>
                              <Link url={help.url} target="_blank">
                                Get a free key
                              </Link>{' '}
                              {help.hint}
                            </>
                          ) : null
                        }
                      />
                      <TextField
                        label="Model (optional)"
                        value={model}
                        onChange={setModel}
                        name="model"
                        autoComplete="off"
                        helpText="Leave blank to use the recommended default for this provider."
                      />
                      <TextField
                        label="Daily cap"
                        type="number"
                        value={dailyCap}
                        onChange={setDailyCap}
                        name="dailyCap"
                        autoComplete="off"
                        min={1}
                        max={10000}
                        helpText={`Used today: ${usedToday} requests. Resets at 00:00 UTC.`}
                      />
                    </>
                  )}

                  <InlineStack gap="200">
                    <Button variant="primary" loading={aiAction.loading} onClick={saveAi}>
                      Save AI settings
                    </Button>
                    {provider !== 'off' && (
                      <Button onClick={runTest} loading={testing} variant="secondary">
                        Test connection
                      </Button>
                    )}
                  </InlineStack>
                </BlockStack>
              </div>

              {aiAction.error && (
                <Banner tone="critical" title="AI settings could not be saved">
                  {aiAction.error}
                </Banner>
              )}
              {testAction.error && (
                <Banner tone="critical" title="Connection test failed">
                  {testAction.error}
                </Banner>
              )}
              {savedAi && <Banner tone="success" title="AI settings saved" />}
              {testResult && (
                <Banner
                  tone={testResult.ok ? 'success' : 'critical'}
                  title={testResult.ok ? 'Connection OK' : 'Connection failed'}
                >
                  <Text as="p" variant="bodyMd">
                    {testResult.message}
                  </Text>
                </Banner>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">
                About this app
              </Text>
              <Text as="p" tone="subdued" variant="bodyMd">
                Klyna Bundles is part of the Klyna indie suite - open, fast, free where it can be.
                The bundle builder, volume breaks, and FBT mining are deterministic and never need
                an API key. AI is only used to title and describe suggested bundles, and only when
                you have added a key.
              </Text>
              <Box>
                <Link url="https://klyna.dev" target="_blank">
                  klyna.dev
                </Link>
                {' . '}
                <Link url="https://github.com/klynahq/klyna" target="_blank">
                  GitHub
                </Link>
              </Box>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Banner tone="info">
            Storefront settings drive the Klyna Bundles theme app extension. After changing them,
            the block picks up new values on the next storefront page load - add the block in the
            theme editor under Add block - Apps.
          </Banner>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
