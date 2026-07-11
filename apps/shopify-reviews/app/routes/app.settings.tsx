import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/node';
import { Form, useActionData, useFetcher, useLoaderData, useNavigation } from '@remix-run/react';
import {
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  Checkbox,
  FormLayout,
  InlineStack,
  Layout,
  Link,
  Page,
  Select,
  Text,
  TextField,
} from '@shopify/polaris';
import { useState } from 'react';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';
import { createAiClient, type AiProvider } from '~/lib/klyna-ai-client';
import { getShopAiSettings, getTodayUsage, saveShopAiSettings } from '../lib/ai.server';

const DEFAULTS = {
  autoPublish: false,
  requestEnabled: false,
  requestDelayDays: 7,
  widgetAccent: '#7c5cff',
  showPhotos: true,
  emailFrom: '',
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const settings = await prisma.settings.findUnique({ where: { shop: session.shop } });
  const ai = await getShopAiSettings(session.shop);
  const usedToday = await getTodayUsage(session.shop);
  return {
    settings: {
      autoPublish: settings?.autoPublish ?? DEFAULTS.autoPublish,
      requestEnabled: settings?.requestEnabled ?? DEFAULTS.requestEnabled,
      requestDelayDays: settings?.requestDelayDays ?? DEFAULTS.requestDelayDays,
      widgetAccent: settings?.widgetAccent ?? DEFAULTS.widgetAccent,
      showPhotos: settings?.showPhotos ?? DEFAULTS.showPhotos,
      emailFrom: settings?.emailFrom ?? DEFAULTS.emailFrom,
    },
    ai,
    usedToday,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get('intent') ?? 'save');

  if (intent === 'test-ai') {
    const provider = String(form.get('provider') ?? 'off') as AiProvider;
    const apiKey = String(form.get('apiKey') ?? '').trim() || undefined;
    const model = String(form.get('model') ?? '').trim() || undefined;
    const client = createAiClient({ provider, apiKey, model });
    const result = await client.test();
    return json({ test: result });
  }

  if (intent === 'save-ai') {
    const provider = String(form.get('provider') ?? 'off') as AiProvider;
    const apiKey = String(form.get('apiKey') ?? '').trim() || undefined;
    const model = String(form.get('model') ?? '').trim() || undefined;
    const dailyCap = Math.max(1, Math.min(10000, Number(form.get('dailyCap') ?? 100) || 100));
    await saveShopAiSettings(session.shop, { provider, apiKey, model, dailyCap });
    return json({ savedAi: true });
  }

  const autoPublish = form.get('autoPublish') === 'on';
  const requestEnabled = form.get('requestEnabled') === 'on';
  const showPhotos = form.get('showPhotos') === 'on';
  const requestDelayDays = Math.min(
    90,
    Math.max(0, parseInt(String(form.get('requestDelayDays') ?? '7'), 10) || 0),
  );
  const widgetAccent = String(form.get('widgetAccent') ?? DEFAULTS.widgetAccent).trim();
  const emailFrom = String(form.get('emailFrom') ?? '').trim();

  const data = { autoPublish, requestEnabled, showPhotos, requestDelayDays, widgetAccent, emailFrom: emailFrom || null };

  await prisma.settings.upsert({
    where: { shop: session.shop },
    create: { shop: session.shop, ...data },
    update: data,
  });

  return json({ ok: true });
};

const PROVIDER_OPTIONS = [
  { label: 'Off — no AI assistance', value: 'off' },
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
    hint: 'Fastest free tier — around 2,000 requests/day. Default: llama-3.3-70b-versatile.',
  },
  gemini: {
    url: 'https://aistudio.google.com/apikey',
    hint: '1,500 free requests/day on gemini-2.0-flash. Best for nuance.',
  },
};

export default function SettingsPage() {
  const { settings, ai, usedToday } = useLoaderData<typeof loader>();
  const data = useActionData<typeof action>();
  const nav = useNavigation();
  const aiFetcher = useFetcher<typeof action>();
  const testFetcher = useFetcher<typeof action>();
  const saving = nav.state === 'submitting';
  const savingAi = aiFetcher.state === 'submitting';
  const testing = testFetcher.state === 'submitting';

  const [autoPublish, setAutoPublish] = useState(settings.autoPublish);
  const [requestEnabled] = useState(false);
  const [showPhotos, setShowPhotos] = useState(settings.showPhotos);
  const [delay, setDelay] = useState(String(settings.requestDelayDays));
  const [accent, setAccent] = useState(settings.widgetAccent);
  const [emailFrom, setEmailFrom] = useState(settings.emailFrom);

  const [provider, setProvider] = useState<string>(ai.provider);
  const [apiKey, setApiKey] = useState(ai.apiKey ?? '');
  const [model, setModel] = useState(ai.model ?? '');
  const [dailyCap, setDailyCap] = useState(String(ai.dailyCap));

  const help = PROVIDER_HELP[provider];
  const savedReviews = data && 'ok' in data && data.ok;
  const savedAi = aiFetcher.data && 'savedAi' in aiFetcher.data ? aiFetcher.data.savedAi : false;
  const testResult =
    testFetcher.data && 'test' in testFetcher.data
      ? (testFetcher.data.test as { ok: boolean; message: string })
      : null;

  const runTest = () => {
    const fd = new FormData();
    fd.set('intent', 'test-ai');
    fd.set('provider', provider);
    fd.set('apiKey', apiKey);
    fd.set('model', model);
    testFetcher.submit(fd, { method: 'post' });
  };

  const saveAi = () => {
    const fd = new FormData();
    fd.set('intent', 'save-ai');
    fd.set('provider', provider);
    fd.set('apiKey', apiKey);
    fd.set('model', model);
    fd.set('dailyCap', dailyCap);
    aiFetcher.submit(fd, { method: 'post' });
  };

  return (
    <Page title="Settings" backAction={{ url: '/app' }}>
      <Layout>
        {savedReviews && (
          <Layout.Section>
            <Banner tone="success" title="Settings saved" />
          </Layout.Section>
        )}

        <Layout.Section>
          <Form method="post">
            <BlockStack gap="400">
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">Moderation</Text>
                  <Checkbox
                    label="Auto-publish 4 and 5 star reviews from verified buyers"
                    helpText="Lower-rated reviews and unverified submissions still wait in the moderation queue."
                    checked={autoPublish}
                    onChange={setAutoPublish}
                  />
                  <input type="hidden" name="autoPublish" value={autoPublish ? 'on' : 'off'} />
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">Review requests</Text>
                  <Checkbox
                    label="Buyer email automation is off in this launch build"
                    helpText="This feature requires Shopify protected customer data approval. Storefront reviews, moderation, widgets, analytics, and schema are available now."
                    checked={requestEnabled}
                    disabled
                  />
                  <input type="hidden" name="requestEnabled" value={requestEnabled ? 'on' : 'off'} />
                  <FormLayout>
                    <Select
                      label="Wait before asking"
                      name="requestDelayDays"
                      options={[
                        { label: 'Immediately', value: '0' },
                        { label: '3 days', value: '3' },
                        { label: '7 days', value: '7' },
                        { label: '14 days', value: '14' },
                        { label: '30 days', value: '30' },
                      ]}
                      value={delay}
                      onChange={setDelay}
                    />
                    <TextField
                      label="From email"
                      name="emailFrom"
                      type="email"
                      autoComplete="email"
                      placeholder="reviews@your-store.com"
                      helpText="Reserved for the protected-data email automation release."
                      value={emailFrom}
                      onChange={setEmailFrom}
                    />
                  </FormLayout>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">Storefront widget</Text>
                  <Checkbox
                    label="Show customer photos in the widget"
                    checked={showPhotos}
                    onChange={setShowPhotos}
                  />
                  <input type="hidden" name="showPhotos" value={showPhotos ? 'on' : 'off'} />
                  <TextField
                    label="Accent color"
                    name="widgetAccent"
                    autoComplete="off"
                    helpText="Star and button color. The theme block also exposes this in the editor."
                    value={accent}
                    onChange={setAccent}
                  />
                </BlockStack>
              </Card>

              <input type="hidden" name="intent" value="save" />
              <Button submit variant="primary" loading={saving}>
                {saving ? 'Saving' : 'Save settings'}
              </Button>
            </BlockStack>
          </Form>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <BlockStack gap="100">
                <Text as="h2" variant="headingMd">AI assistant</Text>
                <Text as="p" tone="subdued">
                  Klyna Reviews can summarize what customers are saying about a product into
                  short themes with representative quotes. Add a free-tier API key from any
                  provider below to turn it on. Your key stays on this app's database.
                </Text>
              </BlockStack>

              <BlockStack gap="300">
                <Select
                  label="Provider"
                  options={PROVIDER_OPTIONS}
                  value={provider}
                  onChange={setProvider}
                />

                {provider !== 'off' && (
                  <>
                    <TextField
                      label="API key"
                      type="password"
                      value={apiKey}
                      onChange={setApiKey}
                      autoComplete="off"
                      helpText={
                        help ? (
                          <>
                            <Link url={help.url} target="_blank">Get a free key</Link>
                            {' '}{help.hint}
                          </>
                        ) : null
                      }
                    />
                    <TextField
                      label="Model (optional)"
                      value={model}
                      onChange={setModel}
                      autoComplete="off"
                      helpText="Leave blank to use the recommended default for this provider."
                    />
                    <TextField
                      label="Daily cap"
                      type="number"
                      value={dailyCap}
                      onChange={setDailyCap}
                      autoComplete="off"
                      min={1}
                      max={10000}
                      helpText={`Used today: ${usedToday} requests. Resets at 00:00 UTC.`}
                    />
                  </>
                )}

                <InlineStack gap="200">
                  <Button onClick={saveAi} variant="primary" loading={savingAi}>
                    Save AI settings
                  </Button>
                  {provider !== 'off' && (
                    <Button onClick={runTest} loading={testing} variant="secondary">
                      Test connection
                    </Button>
                  )}
                </InlineStack>
              </BlockStack>

              {savedAi && <Banner tone="success" title="AI settings saved" />}
              {testResult && (
                <Banner
                  tone={testResult.ok ? 'success' : 'critical'}
                  title={testResult.ok ? 'Connection OK' : 'Connection failed'}
                >
                  <Text as="p" variant="bodyMd">{testResult.message}</Text>
                </Banner>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">About this app</Text>
              <Text as="p" tone="subdued" variant="bodyMd">
                Klyna Reviews is part of the Klyna indie suite. Photo reviews, UGC, rich-snippet
                stars, and review-request emails. AI is optional and only used when you've added
                a key.
              </Text>
              <Box>
                <Link url="https://klyna.dev" target="_blank">klyna.dev</Link>
                {' · '}
                <Link url="https://github.com/klynahq/klyna" target="_blank">GitHub</Link>
              </Box>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
