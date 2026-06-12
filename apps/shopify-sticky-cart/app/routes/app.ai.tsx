import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/node';
import { Form, useActionData, useFetcher, useLoaderData, useNavigation } from '@remix-run/react';
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
  Select,
  Text,
  TextField,
} from '@shopify/polaris';
import { authenticate } from '../shopify.server';
import { createAiClient, type AiProvider } from '~/lib/klyna-ai-client';
import { getShopAiSettings, getTodayUsage, saveShopAiSettings } from '../lib/ai.server';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const settings = await getShopAiSettings(session.shop);
  const usedToday = await getTodayUsage(session.shop);
  return { settings, usedToday };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get('intent') ?? 'save');

  const provider = String(form.get('provider') ?? 'off') as AiProvider;
  const apiKey = String(form.get('apiKey') ?? '').trim() || undefined;
  const model = String(form.get('model') ?? '').trim() || undefined;
  const dailyCap = Math.max(1, Math.min(10000, Number(form.get('dailyCap') ?? 100) || 100));

  if (intent === 'test') {
    const client = createAiClient({ provider, apiKey, model });
    const result = await client.test();
    return json({ test: result });
  }

  await saveShopAiSettings(session.shop, { provider, apiKey, model, dailyCap });
  return json({ saved: true });
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

export default function AiSettings() {
  const { settings, usedToday } = useLoaderData<typeof loader>();
  const data = useActionData<typeof action>();
  const nav = useNavigation();
  const testFetcher = useFetcher<typeof action>();

  const submitting = nav.state === 'submitting';
  const testing = testFetcher.state === 'submitting';

  const [provider, setProvider] = useState<string>(settings.provider);
  const [apiKey, setApiKey] = useState(settings.apiKey ?? '');
  const [model, setModel] = useState(settings.model ?? '');
  const [dailyCap, setDailyCap] = useState(String(settings.dailyCap));

  const testResult =
    testFetcher.data && 'test' in testFetcher.data
      ? (testFetcher.data.test as { ok: boolean; message: string })
      : null;
  const saved = data && 'saved' in data ? data.saved : false;
  const help = PROVIDER_HELP[provider];

  const runTest = () => {
    const fd = new FormData();
    fd.set('intent', 'test');
    fd.set('provider', provider);
    fd.set('apiKey', apiKey);
    fd.set('model', model);
    fd.set('dailyCap', dailyCap);
    testFetcher.submit(fd, { method: 'post' });
  };

  return (
    <Page title="AI assistant" backAction={{ url: '/app' }}>
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <BlockStack gap="100">
                <Text as="h2" variant="headingMd">AI assistant</Text>
                <Text as="p" tone="subdued">
                  Klyna Sticky Cart uses AI for one thing: a one-line cart-recovery banner that
                  varies its angle (free-shipping unlock vs social proof) based on the cart in
                  front of the shopper. Bring a free-tier API key from any provider below. Your
                  key stays on this app's database.
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
                      Save settings
                    </Button>
                    {provider !== 'off' && (
                      <Button onClick={runTest} loading={testing} variant="secondary">
                        Test connection
                      </Button>
                    )}
                    <input type="hidden" name="intent" value="save" />
                  </InlineStack>
                </BlockStack>
              </Form>

              {saved && <Banner tone="success" title="Saved" />}
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
                Klyna Sticky Cart is part of the Klyna indie suite — a sticky add-to-cart bar,
                quick-buy, and free-shipping progress for Shopify. AI is optional and only used
                for the cart-recovery one-liner. No AI key, no AI calls.
              </Text>
              <Box>
                <Link url="https://klyna.dev" target="_blank">klyna.dev</Link>
                {' '}
                <Link url="https://github.com/klynahq/klyna" target="_blank">GitHub</Link>
              </Box>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
