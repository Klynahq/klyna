import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/node';
import { useEffect, useState } from 'react';
import { useActionData, useLoaderData, useNavigation, useSubmit } from '@remix-run/react';
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Card,
  Checkbox,
  InlineGrid,
  InlineStack,
  Layout,
  Page,
  ProgressBar,
  Text,
  TextField,
} from '@shopify/polaris';
import { authenticate } from '../shopify.server';
import {
  getSettings,
  saveSettings,
  type StickyCartSettings,
} from '../models/settings.server';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const settings = await getSettings(session.shop);

  let currency = 'USD';
  try {
    const res = await admin.graphql(
      `#graphql
      query StickyCartCurrency { shop { currencyCode } }`,
    );
    const body = (await res.json()) as { data?: { shop?: { currencyCode?: string } } };
    currency = body.data?.shop?.currencyCode ?? 'USD';
  } catch {
    // default currency
  }

  return json({ settings, currency });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();

  const bool = (k: string) => form.get(k) === 'true';
  const str = (k: string, fallback = '') => String(form.get(k) ?? fallback).trim();
  const threshold = Number.parseFloat(str('freeShipThreshold', '0'));

  const patch: Partial<Omit<StickyCartSettings, 'id' | 'shop'>> = {
    freeShipEnabled: bool('freeShipEnabled'),
    freeShipThreshold: Number.isFinite(threshold) && threshold >= 0 ? threshold : 0,
    freeShipColor: str('freeShipColor', '#34d399') || '#34d399',
    freeShipMessage:
      str('freeShipMessage') || "You're {{remaining}} away from free shipping!",
    freeShipSuccessMsg:
      str('freeShipSuccessMsg') || "You've unlocked free shipping! 🎉",
  };

  const settings = await saveSettings(session.shop, patch);
  return json({ ok: true, settings });
};

export default function FreeShipping() {
  const { settings, currency } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const nav = useNavigation();
  const saving = nav.state === 'submitting';

  const [form, setForm] = useState(settings);
  useEffect(() => {
    if (actionData?.settings) setForm(actionData.settings);
  }, [actionData]);

  const set = <K extends keyof StickyCartSettings>(key: K, value: StickyCartSettings[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSave = () => {
    const fd = new FormData();
    fd.set('freeShipEnabled', String(form.freeShipEnabled));
    fd.set('freeShipThreshold', String(form.freeShipThreshold));
    fd.set('freeShipColor', form.freeShipColor);
    fd.set('freeShipMessage', form.freeShipMessage);
    fd.set('freeShipSuccessMsg', form.freeShipSuccessMsg);
    submit(fd, { method: 'post' });
  };

  const fmt = new Intl.NumberFormat(undefined, { style: 'currency', currency });
  // Preview at 60% of threshold so both states are visible.
  const sampleCart = Math.round(form.freeShipThreshold * 0.6 * 100) / 100;
  const remaining = Math.max(form.freeShipThreshold - sampleCart, 0);
  const pct = form.freeShipThreshold
    ? Math.min(100, Math.round((sampleCart / form.freeShipThreshold) * 100))
    : 100;
  const previewMsg =
    remaining > 0
      ? form.freeShipMessage.replace('{{remaining}}', fmt.format(remaining))
      : form.freeShipSuccessMsg;

  return (
    <Page
      title="Free shipping"
      backAction={{ url: '/app' }}
      primaryAction={{ content: 'Save', onAction: handleSave, loading: saving }}
    >
      <Layout>
        {actionData?.ok && (
          <Layout.Section>
            <Banner tone="success" title="Saved">
              <p>Free-shipping settings are updated and live through the storefront app proxy.</p>
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <BlockStack gap="400">
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">Free-shipping progress bar</Text>
                  <Badge tone={form.freeShipEnabled ? 'success' : undefined}>
                    {form.freeShipEnabled ? 'On' : 'Off'}
                  </Badge>
                </InlineStack>
                <Checkbox
                  label="Show a free-shipping progress bar inside the sticky cart"
                  checked={form.freeShipEnabled}
                  onChange={(v) => set('freeShipEnabled', v)}
                  helpText="It updates as the cart total changes, encouraging shoppers to add more."
                />
                <InlineGrid columns={{ xs: 1, sm: 2 }} gap="200">
                  <TextField
                    label={`Threshold (${currency})`}
                    type="number"
                    autoComplete="off"
                    min={0}
                    step={1}
                    value={String(form.freeShipThreshold)}
                    onChange={(v) => set('freeShipThreshold', Number.parseFloat(v) || 0)}
                    helpText="Cart total at which shipping becomes free."
                  />
                  <TextField
                    label="Progress bar color"
                    autoComplete="off"
                    value={form.freeShipColor}
                    onChange={(v) => set('freeShipColor', v)}
                    helpText="Hex, e.g. #34d399"
                  />
                </InlineGrid>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Messaging</Text>
                <TextField
                  label="In-progress message"
                  autoComplete="off"
                  value={form.freeShipMessage}
                  onChange={(v) => set('freeShipMessage', v)}
                  helpText="Use {{remaining}} for the amount still needed, e.g. 'You're {{remaining}} away from free shipping!'"
                />
                <TextField
                  label="Unlocked message"
                  autoComplete="off"
                  value={form.freeShipSuccessMsg}
                  onChange={(v) => set('freeShipSuccessMsg', v)}
                  helpText="Shown once the cart reaches the threshold."
                />
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Preview</Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Cart of {fmt.format(sampleCart)} toward a {fmt.format(form.freeShipThreshold)} goal.
              </Text>
              <Box
                background="bg-surface-secondary"
                borderRadius="300"
                padding="300"
                borderColor="border"
                borderWidth="025"
              >
                <BlockStack gap="200">
                  <Text as="p" variant="bodySm" fontWeight="medium">{previewMsg}</Text>
                  <ProgressBar progress={pct} size="small" tone="success" />
                </BlockStack>
              </Box>
              <Box
                background="bg-surface-secondary"
                borderRadius="300"
                padding="300"
                borderColor="border"
                borderWidth="025"
              >
                <BlockStack gap="200">
                  <Text as="p" variant="bodySm" fontWeight="medium">
                    {form.freeShipSuccessMsg}
                  </Text>
                  <ProgressBar progress={100} size="small" tone="success" />
                </BlockStack>
              </Box>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
