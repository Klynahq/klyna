import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/node';
import { Form, useActionData, useFetcher, useLoaderData, useNavigation, useSubmit } from '@remix-run/react';
import { useState } from 'react';
import {
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  Checkbox,
  InlineStack,
  Layout,
  Link,
  Page,
  Select,
  Text,
  TextField,
} from '@shopify/polaris';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';
import { ensureShopSettings } from '../lib/feeds.server';
import { createAiClient, type AiProvider } from '@klyna/ai-client';
import { getShopAiSettings, getTodayUsage, saveShopAiSettings } from '../lib/ai.server';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const aiSettings = await getShopAiSettings(session.shop);
  const usedToday = await getTodayUsage(session.shop);
  const shopSettings = await ensureShopSettings(session.shop);
  const feedCount = await prisma.feed.count({ where: { shop: session.shop } });
  return {
    shop: session.shop,
    aiSettings,
    usedToday,
    shopSettings: {
      metafieldNamespace: shopSettings.metafieldNamespace,
      defaultGoogleCategory: shopSettings.defaultGoogleCategory ?? '',
      schedulePaused: shopSettings.schedulePaused,
    },
    feedCount,
  };
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

  if (intent === 'save-ai') {
    const provider = String(form.get('provider') ?? 'off') as AiProvider;
    const apiKey = String(form.get('apiKey') ?? '').trim() || undefined;
    const model = String(form.get('model') ?? '').trim() || undefined;
    const dailyCap = Math.max(1, Math.min(10000, Number(form.get('dailyCap') ?? 100) || 100));
    await saveShopAiSettings(session.shop, { provider, apiKey, model, dailyCap });
    return json({ savedAi: true });
  }

  // save-feed (default)
  const metafieldNamespace = String(form.get('metafieldNamespace') ?? 'klyna_feed').trim() || 'klyna_feed';
  const defaultGoogleCategory = String(form.get('defaultGoogleCategory') ?? '').trim() || null;
  const schedulePaused = form.get('schedulePaused') === 'true';
  await prisma.shopSettings.update({
    where: { shop: session.shop },
    data: { metafieldNamespace, defaultGoogleCategory, schedulePaused },
  });
  return json({ savedFeed: true });
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
    hint: 'Fastest free tier — ~2,000 requests/day. Default: llama-3.3-70b-versatile.',
  },
  gemini: {
    url: 'https://aistudio.google.com/apikey',
    hint: '1,500 free requests/day on gemini-2.0-flash. Best for nuance.',
  },
};

export default function Settings() {
  const { shop, aiSettings, usedToday, shopSettings, feedCount } = useLoaderData<typeof loader>();
  const data = useActionData<typeof action>();
  const nav = useNavigation();
  const submit = useSubmit();
  const testFetcher = useFetcher<typeof action>();

  const submitting = nav.state === 'submitting';
  const testing = testFetcher.state === 'submitting';

  const [provider, setProvider] = useState<string>(aiSettings.provider);
  const [apiKey, setApiKey] = useState(aiSettings.apiKey ?? '');
  const [model, setModel] = useState(aiSettings.model ?? '');
  const [dailyCap, setDailyCap] = useState(String(aiSettings.dailyCap));

  const [namespace, setNamespace] = useState(shopSettings.metafieldNamespace);
  const [defaultCat, setDefaultCat] = useState(shopSettings.defaultGoogleCategory);
  const [paused, setPaused] = useState(shopSettings.schedulePaused);

  const testResult =
    testFetcher.data && 'test' in testFetcher.data
      ? (testFetcher.data.test as { ok: boolean; message: string })
      : null;
  const savedAi = data && 'savedAi' in data ? data.savedAi : false;
  const savedFeed = data && 'savedFeed' in data ? data.savedFeed : false;
  const help = PROVIDER_HELP[provider];

  const runTest = () => {
    const fd = new FormData();
    fd.set('intent', 'test');
    fd.set('provider', provider);
    fd.set('apiKey', apiKey);
    fd.set('model', model);
    testFetcher.submit(fd, { method: 'post' });
  };

  const saveFeed = () => {
    const fd = new FormData();
    fd.set('intent', 'save-feed');
    fd.set('metafieldNamespace', namespace);
    fd.set('defaultGoogleCategory', defaultCat);
    fd.set('schedulePaused', String(paused));
    submit(fd, { method: 'post' });
  };

  return (
    <Page title="Settings" subtitle={`Connected to ${shop}`} backAction={{ url: '/app' }}>
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <BlockStack gap="100">
                <Text as="h2" variant="headingMd">AI assistant</Text>
                <Text as="p" tone="subdued">
                  Klyna Feed uses AI for one job: per-channel product title rewrites
                  tuned to how Google, Meta, and Pinterest rank and click. Bring your
                  own free-tier key from any provider below. Your key stays on this
                  app's database.
                </Text>
              </BlockStack>

              <Form method="post">
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
                    <Button submit variant="primary" loading={submitting}>
                      Save AI settings
                    </Button>
                    {provider !== 'off' && (
                      <Button onClick={runTest} loading={testing} variant="secondary">
                        Test connection
                      </Button>
                    )}
                    <input type="hidden" name="intent" value="save-ai" />
                  </InlineStack>
                </BlockStack>
              </Form>

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
            <BlockStack gap="400">
              <BlockStack gap="100">
                <Text as="h2" variant="headingMd">Metafield overrides</Text>
                <Text as="p" tone="subdued">
                  Klyna reads per-product feed overrides from this metafield namespace.
                  Set a metafield like {`${namespace}.google_product_category`} on a
                  product and map a field to it to override the default for that product.
                </Text>
              </BlockStack>
              <TextField
                label="Metafield namespace"
                autoComplete="off"
                value={namespace}
                onChange={setNamespace}
              />

              <BlockStack gap="100">
                <Text as="h2" variant="headingMd">Default Google product category</Text>
                <Text as="p" tone="subdued">
                  Applied when no collection-level taxonomy mapping matches a product. Use a
                  numeric id from the Google product taxonomy.
                </Text>
              </BlockStack>
              <TextField
                label="Default category id"
                autoComplete="off"
                placeholder="e.g. 166"
                value={defaultCat}
                onChange={setDefaultCat}
              />

              <BlockStack gap="100">
                <Text as="h2" variant="headingMd">Scheduled refresh</Text>
                <Text as="p" tone="subdued">
                  Pause to stop all background rebuilds for this shop. Manual refresh still works.
                </Text>
              </BlockStack>
              <Checkbox
                label="Pause scheduled refresh for all feeds"
                checked={paused}
                onChange={setPaused}
              />

              <InlineStack align="end">
                <Button variant="primary" onClick={saveFeed} loading={submitting}>
                  Save feed settings
                </Button>
              </InlineStack>

              {savedFeed && <Banner tone="success" title="Feed settings saved" />}
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">About this app</Text>
              <Text as="p" tone="subdued" variant="bodyMd">
                Klyna Feed builds Google Shopping XML and Meta, TikTok, and Pinterest CSV
                feeds straight from your catalog. AI is optional and only used for per-channel
                title rewrites — it never touches your catalog or runs without a key. You have
                {' '}{feedCount} feed{feedCount === 1 ? '' : 's'} configured.
              </Text>
              <Box>
                <Link url="https://klyna.dev" target="_blank">klyna.dev</Link>
                {' . '}
                <Link url="https://github.com/klynahq/klyna" target="_blank">GitHub</Link>
              </Box>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
