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
  FormLayout,
  InlineStack,
  Layout,
  Link,
  Page,
  Select,
  Text,
  TextField,
} from '@shopify/polaris';
import { authenticate } from '../shopify.server';
import { getShopSettings } from '../services/waitlist.server';
import prisma from '../db.server';
import { createAiClient, type AiProvider } from '~/lib/klyna-ai-client';
import { getShopAiSettings, getTodayUsage, saveShopAiSettings } from '../lib/ai.server';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const settings = await getShopSettings(session.shop);
  const ai = await getShopAiSettings(session.shop);
  const usedToday = await getTodayUsage(session.shop);
  return { settings, ai, usedToday };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();
  const intent = String(form.get('intent') ?? 'save');

  if (intent === 'ai-test') {
    const provider = String(form.get('provider') ?? 'off') as AiProvider;
    const apiKey = String(form.get('apiKey') ?? '').trim() || undefined;
    const model = String(form.get('model') ?? '').trim() || undefined;
    const client = createAiClient({ provider, apiKey, model });
    const result = await client.test();
    return json({ test: result });
  }

  if (intent === 'ai-save') {
    const provider = String(form.get('provider') ?? 'off') as AiProvider;
    const apiKey = String(form.get('apiKey') ?? '').trim() || undefined;
    const model = String(form.get('model') ?? '').trim() || undefined;
    const dailyCap = Math.max(1, Math.min(10000, Number(form.get('dailyCap') ?? 100) || 100));
    await saveShopAiSettings(shop, { provider, apiKey, model, dailyCap });
    return json({ aiSaved: true });
  }

  const buttonLabel = String(form.get('buttonLabel') ?? '').trim() || 'Notify me when available';
  const successMessage =
    String(form.get('successMessage') ?? '').trim() ||
    "You're on the list - we'll email you the moment it's back.";
  const collectPhone = form.get('collectPhone') === 'true';
  const requireConsent = form.get('requireConsent') === 'true';
  const alertsEnabled = form.get('alertsEnabled') === 'true';
  const resendGuardHours = clampInt(Number(form.get('resendGuardHours')), 0, 720, 24);

  await prisma.shopSettings.upsert({
    where: { shop },
    update: { buttonLabel, successMessage, collectPhone, requireConsent, alertsEnabled, resendGuardHours },
    create: { shop, buttonLabel, successMessage, collectPhone, requireConsent, alertsEnabled, resendGuardHours },
  });

  return json({ ok: true });
};

function clampInt(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

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
    hint: 'Fastest free tier - ~2,000 requests/day. Default: llama-3.3-70b-versatile.',
  },
  gemini: {
    url: 'https://aistudio.google.com/apikey',
    hint: '1,500 free requests/day on gemini-2.0-flash. Best for nuance.',
  },
};

export default function Settings() {
  const { settings, ai, usedToday } = useLoaderData<typeof loader>();
  const data = useActionData<typeof action>();
  const nav = useNavigation();
  const submit = useSubmit();
  const testFetcher = useFetcher<typeof action>();
  const saving = nav.state === 'submitting';
  const testing = testFetcher.state === 'submitting';

  const [buttonLabel, setButtonLabel] = useState(settings.buttonLabel);
  const [successMessage, setSuccessMessage] = useState(settings.successMessage);
  const [collectPhone, setCollectPhone] = useState(settings.collectPhone);
  const [requireConsent, setRequireConsent] = useState(settings.requireConsent);
  const [alertsEnabled, setAlertsEnabled] = useState(settings.alertsEnabled);
  const [resendGuardHours, setResendGuardHours] = useState(String(settings.resendGuardHours));

  const [provider, setProvider] = useState<string>(ai.provider);
  const [apiKey, setApiKey] = useState(ai.apiKey ?? '');
  const [model, setModel] = useState(ai.model ?? '');
  const [dailyCap, setDailyCap] = useState(String(ai.dailyCap));

  const handleSave = () => {
    const fd = new FormData();
    fd.set('intent', 'save');
    fd.set('buttonLabel', buttonLabel);
    fd.set('successMessage', successMessage);
    fd.set('collectPhone', String(collectPhone));
    fd.set('requireConsent', String(requireConsent));
    fd.set('alertsEnabled', String(alertsEnabled));
    fd.set('resendGuardHours', resendGuardHours);
    submit(fd, { method: 'post' });
  };

  const testResult =
    testFetcher.data && 'test' in testFetcher.data
      ? (testFetcher.data.test as { ok: boolean; message: string })
      : null;
  const aiSaved = data && 'aiSaved' in data ? data.aiSaved : false;
  const settingsSaved = data && 'ok' in data ? data.ok : false;
  const help = PROVIDER_HELP[provider];

  const runTest = () => {
    const fd = new FormData();
    fd.set('intent', 'ai-test');
    fd.set('provider', provider);
    fd.set('apiKey', apiKey);
    fd.set('model', model);
    testFetcher.submit(fd, { method: 'post' });
  };

  return (
    <Page
      title="Settings"
      subtitle="Tune the storefront widget, delivery, and AI assistance."
      backAction={{ url: '/app' }}
      primaryAction={{ content: 'Save', onAction: handleSave, loading: saving }}
    >
      <Layout>
        {settingsSaved && (
          <Layout.Section>
            <Banner tone="success" title="Settings saved" />
          </Layout.Section>
        )}

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Storefront widget</Text>
              <FormLayout>
                <TextField
                  label="Button label"
                  value={buttonLabel}
                  onChange={setButtonLabel}
                  autoComplete="off"
                  helpText="Shown on sold-out variants in your theme."
                />
                <TextField
                  label="Success message"
                  value={successMessage}
                  onChange={setSuccessMessage}
                  autoComplete="off"
                  multiline={2}
                  helpText="Confirmation shown after a shopper signs up."
                />
                <Checkbox
                  label="Collect phone number for SMS alerts"
                  checked={collectPhone}
                  onChange={setCollectPhone}
                  helpText="Adds a phone field alongside email. Requires Twilio credentials to deliver."
                />
                <Checkbox
                  label="Require explicit marketing consent"
                  checked={requireConsent}
                  onChange={setRequireConsent}
                  helpText="Adds a consent checkbox the shopper must tick before subscribing."
                />
              </FormLayout>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Delivery</Text>
              <FormLayout>
                <Select
                  label="Alerts"
                  options={[
                    { label: 'Enabled - send alerts on restock', value: 'true' },
                    { label: "Paused - capture signups but don't send", value: 'false' },
                  ]}
                  value={String(alertsEnabled)}
                  onChange={(v) => setAlertsEnabled(v === 'true')}
                />
                <TextField
                  label="Resend guard (hours)"
                  type="number"
                  value={resendGuardHours}
                  onChange={setResendGuardHours}
                  autoComplete="off"
                  min={0}
                  max={720}
                  helpText="Don't re-alert the same contact about the same variant within this window. Guards against a flapping inventory feed."
                />
              </FormLayout>
              <Text as="p" variant="bodySm" tone="subdued">
                Email is delivered via Resend and SMS via Twilio when their API keys
                are set in the environment. Without keys, Klyna runs in log-only
                mode - every alert is still recorded so the pipeline behaves
                identically in development.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <BlockStack gap="100">
                <Text as="h2" variant="headingMd">AI assistant</Text>
                <Text as="p" tone="subdued">
                  Optional. Used to draft restock alert subject lines and to score
                  how confident smart-timing should be about a given send. Bring
                  your own free-tier key from any provider below - your key stays
                  on this app's database.
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
                    <Button submit variant="primary" loading={saving}>
                      Save AI settings
                    </Button>
                    {provider !== 'off' && (
                      <Button onClick={runTest} loading={testing} variant="secondary">
                        Test connection
                      </Button>
                    )}
                    <input type="hidden" name="intent" value="ai-save" />
                  </InlineStack>
                </BlockStack>
              </Form>

              {aiSaved && <Banner tone="success" title="AI settings saved" />}
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
                Klyna Back-in-Stock turns sold-out moments into a recovery channel:
                shoppers tap Notify me, you get the demand signal, and alerts fire
                the moment inventory returns - at a time that respects the
                recipient's local hours. AI is optional and BYOK.
              </Text>
              <Box>
                <Link url="https://klyna.dev" target="_blank">klyna.dev</Link>
                {' - '}
                <Link url="https://github.com/klynahq/klyna" target="_blank">GitHub</Link>
              </Box>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
