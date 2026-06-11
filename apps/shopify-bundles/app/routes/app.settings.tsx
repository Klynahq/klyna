import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/node';
import { useState } from 'react';
import { useLoaderData, useNavigation, useSubmit } from '@remix-run/react';
import {
  BlockStack,
  Banner,
  Button,
  Card,
  Checkbox,
  Divider,
  InlineStack,
  Layout,
  Page,
  Select,
  Text,
  TextField,
} from '@shopify/polaris';
import { authenticate } from '../shopify.server';
import { getSettings, updateSettings } from '../lib/settings.server';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const settings = await getSettings(session.shop);
  return { settings };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();

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

export default function Settings() {
  const { settings } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const nav = useNavigation();
  const saving = nav.state === 'submitting';

  const [defaultDiscountType, setDefaultDiscountType] = useState(settings.defaultDiscountType);
  const [priceDisplay, setPriceDisplay] = useState(settings.priceDisplay);
  const [widgetHeading, setWidgetHeading] = useState(settings.widgetHeading);
  const [bundleHeading, setBundleHeading] = useState(settings.bundleHeading);
  const [accentColor, setAccentColor] = useState(settings.accentColor);
  const [showSavingsBadge, setShowSavingsBadge] = useState(settings.showSavingsBadge);
  const [autoFbt, setAutoFbt] = useState(settings.autoFbt);

  const save = () => {
    const fd = new FormData();
    fd.set('defaultDiscountType', defaultDiscountType);
    fd.set('priceDisplay', priceDisplay);
    fd.set('widgetHeading', widgetHeading);
    fd.set('bundleHeading', bundleHeading);
    fd.set('accentColor', accentColor);
    if (showSavingsBadge) fd.set('showSavingsBadge', 'on');
    if (autoFbt) fd.set('autoFbt', 'on');
    submit(fd, { method: 'post' });
  };

  return (
    <Page
      title="Settings"
      backAction={{ url: '/app' }}
      primaryAction={{ content: 'Save', loading: saving, onAction: save }}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Discount defaults</Text>
              <Select
                label="Default discount type for new offers"
                options={[
                  { label: 'Percentage off', value: 'percentage' },
                  { label: 'Fixed amount off', value: 'fixed_amount' },
                ]}
                value={defaultDiscountType}
                onChange={setDefaultDiscountType}
              />
              <Checkbox
                label="Auto-refresh frequently-bought-together pairs"
                helpText="Recompute recommendations from order history on a schedule."
                checked={autoFbt}
                onChange={setAutoFbt}
              />
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Storefront display</Text>
              <Select
                label="Bundle price display"
                helpText="How the discounted price is shown in the product-page block."
                options={[
                  { label: 'Single total — one bundle price', value: 'total' },
                  { label: 'Stacked — strikethrough per item', value: 'stacked' },
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
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Banner tone="info">
            These settings drive the Klyna Bundles theme app extension. After changing
            them, the block picks up new values on the next storefront page load — add
            the block in the theme editor under <b>Add block → Apps</b>.
          </Banner>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
