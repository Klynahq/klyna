import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/node';
import { Form, useActionData, useFetcher, useLoaderData, useNavigation } from '@remix-run/react';
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
import { useState } from 'react';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';
import { getProgram } from '../rewards.server';
import { createAiClient, type AiProvider } from '~/lib/klyna-ai-client';
import { getShopAiSettings, getTodayUsage, saveShopAiSettings } from '../lib/ai.server';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const program = await getProgram(session.shop);
  const ai = await getShopAiSettings(session.shop);
  const usedToday = await getTodayUsage(session.shop);
  return {
    program: {
      active: program.active,
      programName: program.programName,
      pointsPerDollar: program.pointsPerDollar,
      pointsPerSignup: program.pointsPerSignup,
      pointsPerReview: program.pointsPerReview,
      pointsPerReferral: program.pointsPerReferral,
      redeemPoints: program.redeemPoints,
      redeemValue: program.redeemValue,
      currencyCode: program.currencyCode,
      refereeDiscountPct: program.refereeDiscountPct,
    },
    ai,
    usedToday,
  };
};

const num = (form: FormData, key: string, fallback: number): number => {
  const v = parseInt(String(form.get(key) ?? ''), 10);
  return Number.isFinite(v) && v >= 0 ? v : fallback;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const current = await getProgram(shop);
  const form = await request.formData();
  const intent = String(form.get('intent') ?? 'save');

  if (intent === 'toggle') {
    const updated = await prisma.program.update({
      where: { shop },
      data: { active: !current.active },
    });
    return json({ ok: updated.active ? 'Program activated.' : 'Program paused.' });
  }

  if (intent === 'ai-save') {
    const provider = String(form.get('provider') ?? 'off') as AiProvider;
    const apiKey = String(form.get('apiKey') ?? '').trim() || undefined;
    const model = String(form.get('model') ?? '').trim() || undefined;
    const dailyCap = Math.max(1, Math.min(10000, Number(form.get('dailyCap') ?? 100) || 100));
    await saveShopAiSettings(shop, { provider, apiKey, model, dailyCap });
    return json({ ok: 'AI settings saved.' });
  }

  if (intent === 'ai-test') {
    const provider = String(form.get('provider') ?? 'off') as AiProvider;
    const apiKey = String(form.get('apiKey') ?? '').trim() || undefined;
    const model = String(form.get('model') ?? '').trim() || undefined;
    const client = createAiClient({ provider, apiKey, model });
    const result = await client.test();
    return json({ test: result });
  }

  await prisma.program.update({
    where: { shop },
    data: {
      programName: String(form.get('programName') ?? current.programName).trim() || 'Rewards',
      pointsPerDollar: num(form, 'pointsPerDollar', current.pointsPerDollar),
      pointsPerSignup: num(form, 'pointsPerSignup', current.pointsPerSignup),
      pointsPerReview: num(form, 'pointsPerReview', current.pointsPerReview),
      pointsPerReferral: num(form, 'pointsPerReferral', current.pointsPerReferral),
      redeemPoints: Math.max(1, num(form, 'redeemPoints', current.redeemPoints)),
      redeemValue: Math.max(1, num(form, 'redeemValue', current.redeemValue)),
      currencyCode: String(form.get('currencyCode') ?? current.currencyCode).trim().toUpperCase() || 'USD',
      refereeDiscountPct: Math.min(100, num(form, 'refereeDiscountPct', current.refereeDiscountPct)),
    },
  });
  return json({ ok: 'Settings saved.' });
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
  const { program, ai, usedToday } = useLoaderData<typeof loader>();
  const data = useActionData<typeof action>();
  const nav = useNavigation();
  const testFetcher = useFetcher<typeof action>();
  const submitting = nav.state === 'submitting';
  const testing = testFetcher.state === 'submitting';
  const ok = data && 'ok' in data ? data.ok : null;
  const error = data && 'error' in data ? data.error : null;

  const [aiProvider, setAiProvider] = useState<string>(ai.provider);
  const [aiKey, setAiKey] = useState(ai.apiKey ?? '');
  const [aiModel, setAiModel] = useState(ai.model ?? '');
  const [aiCap, setAiCap] = useState(String(ai.dailyCap));
  const aiHelp = PROVIDER_HELP[aiProvider];
  const testResult =
    testFetcher.data && 'test' in testFetcher.data
      ? (testFetcher.data.test as { ok: boolean; message: string })
      : null;

  const runAiTest = () => {
    const fd = new FormData();
    fd.set('intent', 'ai-test');
    fd.set('provider', aiProvider);
    fd.set('apiKey', aiKey);
    fd.set('model', aiModel);
    testFetcher.submit(fd, { method: 'post' });
  };

  const [form, setForm] = useState({
    programName: program.programName,
    pointsPerDollar: String(program.pointsPerDollar),
    pointsPerSignup: String(program.pointsPerSignup),
    pointsPerReview: String(program.pointsPerReview),
    pointsPerReferral: String(program.pointsPerReferral),
    redeemPoints: String(program.redeemPoints),
    redeemValue: String(program.redeemValue),
    currencyCode: program.currencyCode,
    refereeDiscountPct: String(program.refereeDiscountPct),
  });
  const set = (k: keyof typeof form) => (v: string) => setForm((s) => ({ ...s, [k]: v }));

  const previewRate =
    Number(form.redeemPoints) > 0
      ? (Number(form.redeemValue) / Number(form.redeemPoints)).toFixed(3)
      : '—';

  return (
    <Page
      title="Settings"
      subtitle="Earning rules, redemption rate, and program status"
      backAction={{ url: '/app' }}
      primaryAction={
        <Form method="post">
          <input type="hidden" name="intent" value="toggle" />
          <Button submit tone={program.active ? 'critical' : 'success'}>
            {program.active ? 'Pause program' : 'Activate program'}
          </Button>
        </Form>
      }
    >
      <Layout>
        {!!(ok || error) && (
          <Layout.Section>
            <Box
              padding="300"
              background={error ? 'bg-surface-critical' : 'bg-surface-success'}
              borderRadius="200"
            >
              <Text as="p" tone={error ? 'critical' : 'success'}>{String(ok ?? error)}</Text>
            </Box>
          </Layout.Section>
        )}

        <Layout.Section>
          <Form method="post">
            <input type="hidden" name="intent" value="save" />
            <BlockStack gap="300">
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">Program</Text>
                  <FormLayout>
                    <FormLayout.Group>
                      <TextField
                        label="Program name"
                        name="programName"
                        autoComplete="off"
                        value={form.programName}
                        onChange={set('programName')}
                        helpText="Shown in the storefront widget header."
                      />
                      <TextField
                        label="Currency code"
                        name="currencyCode"
                        autoComplete="off"
                        value={form.currencyCode}
                        onChange={set('currencyCode')}
                        helpText="ISO 4217, e.g. USD, GBP, EUR."
                      />
                    </FormLayout.Group>
                  </FormLayout>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">Earning rules</Text>
                  <FormLayout>
                    <FormLayout.Group>
                      <TextField
                        label="Points per currency unit spent"
                        name="pointsPerDollar"
                        type="number"
                        autoComplete="off"
                        value={form.pointsPerDollar}
                        onChange={set('pointsPerDollar')}
                      />
                      <TextField
                        label="Signup bonus"
                        name="pointsPerSignup"
                        type="number"
                        autoComplete="off"
                        value={form.pointsPerSignup}
                        onChange={set('pointsPerSignup')}
                      />
                    </FormLayout.Group>
                    <FormLayout.Group>
                      <TextField
                        label="Points per review"
                        name="pointsPerReview"
                        type="number"
                        autoComplete="off"
                        value={form.pointsPerReview}
                        onChange={set('pointsPerReview')}
                      />
                      <TextField
                        label="Points per converted referral"
                        name="pointsPerReferral"
                        type="number"
                        autoComplete="off"
                        value={form.pointsPerReferral}
                        onChange={set('pointsPerReferral')}
                      />
                    </FormLayout.Group>
                  </FormLayout>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">Redemption</Text>
                  <FormLayout>
                    <FormLayout.Group>
                      <TextField
                        label="Points to redeem"
                        name="redeemPoints"
                        type="number"
                        autoComplete="off"
                        value={form.redeemPoints}
                        onChange={set('redeemPoints')}
                      />
                      <TextField
                        label={`Discount value (${form.currencyCode})`}
                        name="redeemValue"
                        type="number"
                        autoComplete="off"
                        value={form.redeemValue}
                        onChange={set('redeemValue')}
                      />
                      <TextField
                        label="Referred friend discount (%)"
                        name="refereeDiscountPct"
                        type="number"
                        autoComplete="off"
                        value={form.refereeDiscountPct}
                        onChange={set('refereeDiscountPct')}
                      />
                    </FormLayout.Group>
                    <Text as="p" tone="subdued" variant="bodySm">
                      Effective rate: {previewRate} {form.currencyCode} per point —{' '}
                      {form.redeemPoints} pts → {form.currencyCode} {form.redeemValue} off.
                    </Text>
                  </FormLayout>
                </BlockStack>
              </Card>

              <InlineStack align="end">
                <Button submit variant="primary" loading={submitting}>Save settings</Button>
              </InlineStack>
            </BlockStack>
          </Form>

          <Box paddingBlockStart="400">
            <Card>
              <BlockStack gap="300">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingMd">AI assistant</Text>
                  <Text as="p" tone="subdued">
                    Klyna Rewards can draft personalized tier-unlock emails for your members
                    using a free-tier LLM. Bring your own key from any provider below — it
                    stays on this app's database.
                  </Text>
                </BlockStack>

                <Form method="post">
                  <input type="hidden" name="intent" value="ai-save" />
                  <BlockStack gap="300">
                    <Select
                      label="Provider"
                      options={PROVIDER_OPTIONS}
                      value={aiProvider}
                      onChange={setAiProvider}
                      name="provider"
                    />
                    {aiProvider !== 'off' && (
                      <>
                        <TextField
                          label="API key"
                          type="password"
                          value={aiKey}
                          onChange={setAiKey}
                          name="apiKey"
                          autoComplete="off"
                          helpText={
                            aiHelp ? (
                              <>
                                <Link url={aiHelp.url} target="_blank">Get a free key</Link>
                                {' '}{aiHelp.hint}
                              </>
                            ) : null
                          }
                        />
                        <TextField
                          label="Model (optional)"
                          value={aiModel}
                          onChange={setAiModel}
                          name="model"
                          autoComplete="off"
                          helpText="Leave blank to use the recommended default for this provider."
                        />
                        <TextField
                          label="Daily cap"
                          type="number"
                          value={aiCap}
                          onChange={setAiCap}
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
                      {aiProvider !== 'off' && (
                        <Button onClick={runAiTest} loading={testing} variant="secondary">
                          Test connection
                        </Button>
                      )}
                    </InlineStack>
                  </BlockStack>
                </Form>

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
          </Box>

          <Box paddingBlockStart="400">
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">About this app</Text>
                <Text as="p" tone="subdued" variant="bodyMd">
                  Klyna Rewards is an indie loyalty program for Shopify — points, tiers,
                  and referrals without the per-member SaaS bill. The AI assistant is
                  optional and only used to draft tier-unlock emails to your members.
                </Text>
                <Box>
                  <Link url="https://klyna.dev" target="_blank">klyna.dev</Link>
                  {' '}
                  <Link url="https://github.com/klynahq/klyna" target="_blank">GitHub</Link>
                </Box>
              </BlockStack>
            </Card>
          </Box>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="200">
              <Text as="h3" variant="headingSm">Storefront widget</Text>
              <Text as="p" tone="subdued" variant="bodySm">
                Add the "Klyna Rewards" block to any theme section from the theme
                editor (Online Store → Customize → Add block → Apps). It reads these
                settings live, so changes here update the widget instantly.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
