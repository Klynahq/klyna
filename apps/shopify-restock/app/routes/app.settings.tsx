import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/node';
import { Form, useActionData, useFetcher, useLoaderData, useNavigation, useSubmit } from '@remix-run/react';
import { useState } from 'react';
import {
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
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
import { useEmbeddedRoute } from '../lib/embedded-routes';
import { getShopPlan, planSelectionUrl } from '../lib/plans.server';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const settings = await getShopSettings(session.shop);
  const ai = await getShopAiSettings(session.shop);
  const usedToday = await getTodayUsage(session.shop);
  const planHandle = await getShopPlan(session.shop, admin);
  const storeHandle = session.shop.replace(/\.myshopify\.com$/i, '');
  return {
    settings,
    ai,
    usedToday,
    planHandle,
    pricingUrl: planSelectionUrl(session.shop),
    themeEditorUrl: `https://admin.shopify.com/store/${storeHandle}/themes/current/editor`,
    emailDeliveryConfigured: Boolean(process.env.RESEND_API_KEY),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();
  const intent = String(form.get('intent') ?? 'save');

  if (intent === 'ai-test') {
    if ((await getShopPlan(shop, admin)) !== 'growth') {
      return json(
        { planError: 'AI assistance is available on the Growth plan.' },
        { status: 403 },
      );
    }
    const provider = String(form.get('provider') ?? 'off') as AiProvider;
    const apiKey = String(form.get('apiKey') ?? '').trim() || undefined;
    const model = String(form.get('model') ?? '').trim() || undefined;
    const client = createAiClient({ provider, apiKey, model });
    const result = await client.test();
    return json({ test: result });
  }

  if (intent === 'ai-save') {
    if ((await getShopPlan(shop, admin)) !== 'growth') {
      return json(
        { planError: 'AI assistance is available on the Growth plan.' },
        { status: 403 },
      );
    }
    const provider = String(form.get('provider') ?? 'off') as AiProvider;
    const apiKey = String(form.get('apiKey') ?? '').trim() || undefined;
    const model = String(form.get('model') ?? '').trim() || undefined;
    const dailyCap = Math.max(1, Math.min(10000, Number(form.get('dailyCap') ?? 100) || 100));
    await saveShopAiSettings(shop, { provider, apiKey, model, dailyCap });
    return json({ aiSaved: true });
  }

  const alertsEnabled = form.get('alertsEnabled') === 'true';
  const resendGuardHours = clampInt(Number(form.get('resendGuardHours')), 0, 720, 24);

  await prisma.shopSettings.upsert({
    where: { shop },
    update: { alertsEnabled, resendGuardHours },
    create: { shop, alertsEnabled, resendGuardHours },
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
  const {
    settings,
    ai,
    usedToday,
    planHandle,
    pricingUrl,
    themeEditorUrl,
    emailDeliveryConfigured,
  } = useLoaderData<typeof loader>();
  const embeddedRoute = useEmbeddedRoute();
  const data = useActionData<typeof action>();
  const nav = useNavigation();
  const submit = useSubmit();
  const testFetcher = useFetcher<typeof action>();
  const saving = nav.state === 'submitting';
  const testing = testFetcher.state === 'submitting';

  const [alertsEnabled, setAlertsEnabled] = useState(settings.alertsEnabled);
  const [resendGuardHours, setResendGuardHours] = useState(String(settings.resendGuardHours));

  const [provider, setProvider] = useState<string>(ai.provider);
  const [apiKey, setApiKey] = useState(ai.apiKey ?? '');
  const [model, setModel] = useState(ai.model ?? '');
  const [dailyCap, setDailyCap] = useState(String(ai.dailyCap));

  const handleSave = () => {
    const fd = new FormData();
    fd.set('intent', 'save');
    fd.set('alertsEnabled', String(alertsEnabled));
    fd.set('resendGuardHours', resendGuardHours);
    submit(fd, { method: 'post', action: embeddedRoute('/app/settings') });
  };

  const testResult =
    testFetcher.data && 'test' in testFetcher.data
      ? (testFetcher.data.test as { ok: boolean; message: string })
      : null;
  const aiSaved = data && 'aiSaved' in data ? data.aiSaved : false;
  const settingsSaved = data && 'ok' in data ? data.ok : false;
  const planError = data && 'planError' in data ? data.planError : null;
  const help = PROVIDER_HELP[provider];

  const runTest = () => {
    const fd = new FormData();
    fd.set('intent', 'ai-test');
    fd.set('provider', provider);
    fd.set('apiKey', apiKey);
    fd.set('model', model);
    testFetcher.submit(fd, {
      method: 'post',
      action: embeddedRoute('/app/settings'),
    });
  };

  return (
    <Page
      title="Settings"
      subtitle="Tune the storefront widget, delivery, and AI assistance."
      backAction={{ url: embeddedRoute('/app') }}
      primaryAction={{ content: 'Save', onAction: handleSave, loading: saving }}
    >
      <Layout>
        {settingsSaved && (
          <Layout.Section>
            <Banner tone="success" title="Settings saved" />
          </Layout.Section>
        )}

        {!emailDeliveryConfigured && (
          <Layout.Section>
            <Banner tone="critical" title="Email delivery is not configured">
              <Text as="p">
                Waitlist capture works, but email alerts will be recorded as failed
                until Klyna connects its production email provider.
              </Text>
            </Banner>
          </Layout.Section>
        )}

        {planHandle === 'free' && (
          <Layout.Section>
            <Banner
              tone="info"
              title="Free plan"
              action={{ content: 'View Growth plan', url: pricingUrl }}
            >
              <Text as="p">
                Growth unlocks unlimited active subscribers, CSV export, smart
                timing, and AI assistance.
              </Text>
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Storefront widget</Text>
              <Text as="p" tone="subdued">
                Shopify stores button copy, consent, phone capture, and accent
                color inside the Klyna Notify me theme block. Edit those settings
                directly in your product template so the preview always matches
                the live storefront.
              </Text>
              <InlineStack>
                <Button url={themeEditorUrl} target="_top">Open theme editor</Button>
              </InlineStack>
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
                Email provider: {emailDeliveryConfigured ? 'configured' : 'not configured'}.
                Failed deliveries remain visible in the dashboard and can be retried
                after the provider issue is fixed.
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

              <Form method="post" action={embeddedRoute('/app/settings')}>
                <BlockStack gap="300">
                  <Select
                    label="Provider"
                    options={PROVIDER_OPTIONS}
                    value={provider}
                    onChange={setProvider}
                    name="provider"
                    disabled={planHandle !== 'growth'}
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
                        disabled={planHandle !== 'growth'}
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
                        disabled={planHandle !== 'growth'}
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
                        disabled={planHandle !== 'growth'}
                        helpText={`Used today: ${usedToday} requests. Resets at 00:00 UTC.`}
                      />
                    </>
                  )}

                  <InlineStack gap="200">
                    <Button
                      submit
                      variant="primary"
                      loading={saving}
                      disabled={planHandle !== 'growth'}
                    >
                      Save AI settings
                    </Button>
                    {provider !== 'off' && (
                      <Button
                        onClick={runTest}
                        loading={testing}
                        variant="secondary"
                        disabled={planHandle !== 'growth'}
                      >
                        Test connection
                      </Button>
                    )}
                    <input type="hidden" name="intent" value="ai-save" />
                  </InlineStack>
                </BlockStack>
              </Form>

              {aiSaved && <Banner tone="success" title="AI settings saved" />}
              {typeof planError === 'string' && planError && (
                <Banner tone="critical" title={planError} />
              )}
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
