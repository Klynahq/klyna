import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/node';
import { useEffect, useState } from 'react';
import { useActionData, useLoaderData, useNavigation, useSubmit } from '@remix-run/react';
import {
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  Checkbox,
  Divider,
  InlineGrid,
  InlineStack,
  Layout,
  Page,
  Select,
  Text,
  TextField,
} from '@shopify/polaris';
import { authenticate } from '../shopify.server';
import {
  getSettings,
  saveSettings,
  syncSettingsMetaobject,
  type StickyCartSettings,
} from '../models/settings.server';

type PreviewProduct = {
  title: string;
  image: string | null;
  price: string;
  currency: string;
  variantTitle: string | null;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const settings = await getSettings(session.shop);

  // Pull one published product so the merchant previews the bar with real data.
  let preview: PreviewProduct | null = null;
  try {
    const res = await admin.graphql(
      `#graphql
      query StickyCartPreviewProduct {
        products(first: 1, query: "status:active") {
          nodes {
            title
            featuredImage { url(transform: { maxWidth: 120, maxHeight: 120 }) }
            variants(first: 1) {
              nodes {
                title
                price
              }
            }
          }
        }
        shop { currencyCode }
      }`,
    );
    const body = (await res.json()) as {
      data?: {
        products?: {
          nodes?: {
            title: string;
            featuredImage?: { url?: string } | null;
            variants?: { nodes?: { title: string; price: string }[] };
          }[];
        };
        shop?: { currencyCode?: string };
      };
    };
    const p = body.data?.products?.nodes?.[0];
    const v = p?.variants?.nodes?.[0];
    if (p && v) {
      preview = {
        title: p.title,
        image: p.featuredImage?.url ?? null,
        price: v.price,
        currency: body.data?.shop?.currencyCode ?? 'USD',
        variantTitle: v.title === 'Default Title' ? null : v.title,
      };
    }
  } catch {
    // preview is optional
  }

  return json({ settings, preview });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const form = await request.formData();

  const bool = (k: string) => form.get(k) === 'true';
  const str = (k: string, fallback = '') => String(form.get(k) ?? fallback).trim();

  const patch: Partial<Omit<StickyCartSettings, 'id' | 'shop'>> = {
    enabled: bool('enabled'),
    position: str('position') === 'top' ? 'top' : 'bottom',
    showAfterScroll: bool('showAfterScroll'),
    showImage: bool('showImage'),
    showPrice: bool('showPrice'),
    showVariantSelector: bool('showVariantSelector'),
    showQuantity: bool('showQuantity'),
    ctaLabel: str('ctaLabel', 'Add to cart') || 'Add to cart',
    ctaColor: str('ctaColor', '#7c5cff') || '#7c5cff',
    ctaTextColor: str('ctaTextColor', '#ffffff') || '#ffffff',
    quickBuyEnabled: bool('quickBuyEnabled'),
    quickBuyLabel: str('quickBuyLabel', 'Buy it now') || 'Buy it now',
  };

  const settings = await saveSettings(session.shop, patch);
  const synced = await syncSettingsMetaobject(admin, settings);

  return json({ ok: true, synced, settings });
};

export default function StickyBarSettings() {
  const { settings, preview } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const nav = useNavigation();
  const saving = nav.state === 'submitting';

  const [form, setForm] = useState(settings);
  // Re-sync local state if the saved settings come back changed.
  useEffect(() => {
    if (actionData?.settings) setForm(actionData.settings);
  }, [actionData]);

  const set = <K extends keyof StickyCartSettings>(key: K, value: StickyCartSettings[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSave = () => {
    const fd = new FormData();
    fd.set('enabled', String(form.enabled));
    fd.set('position', form.position);
    fd.set('showAfterScroll', String(form.showAfterScroll));
    fd.set('showImage', String(form.showImage));
    fd.set('showPrice', String(form.showPrice));
    fd.set('showVariantSelector', String(form.showVariantSelector));
    fd.set('showQuantity', String(form.showQuantity));
    fd.set('ctaLabel', form.ctaLabel);
    fd.set('ctaColor', form.ctaColor);
    fd.set('ctaTextColor', form.ctaTextColor);
    fd.set('quickBuyEnabled', String(form.quickBuyEnabled));
    fd.set('quickBuyLabel', form.quickBuyLabel);
    submit(fd, { method: 'post' });
  };

  return (
    <Page
      title="Sticky bar"
      backAction={{ url: '/app' }}
      primaryAction={{ content: 'Save', onAction: handleSave, loading: saving }}
    >
      <Layout>
        {actionData?.ok && (
          <Layout.Section>
            <Banner tone={actionData.synced ? 'success' : 'warning'} title="Saved">
              <p>
                {actionData.synced
                  ? 'Your sticky bar is updated and live on the storefront.'
                  : 'Settings saved. The storefront mirror could not be updated right now — the bar still reads live settings through the app proxy.'}
              </p>
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <BlockStack gap="400">
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Visibility</Text>
                <Checkbox
                  label="Enable sticky add-to-cart bar"
                  checked={form.enabled}
                  onChange={(v) => set('enabled', v)}
                  helpText="Master switch. When off, the bar never renders."
                />
                <Select
                  label="Position"
                  options={[
                    { label: 'Bottom of the screen (recommended for mobile)', value: 'bottom' },
                    { label: 'Top, under the header', value: 'top' },
                  ]}
                  value={form.position}
                  onChange={(v) => set('position', v === 'top' ? 'top' : 'bottom')}
                />
                <Checkbox
                  label="Only show after the shopper scrolls past the product's add-to-cart button"
                  checked={form.showAfterScroll}
                  onChange={(v) => set('showAfterScroll', v)}
                />
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">What the bar shows</Text>
                <InlineGrid columns={{ xs: 1, sm: 2 }} gap="200">
                  <Checkbox
                    label="Product image"
                    checked={form.showImage}
                    onChange={(v) => set('showImage', v)}
                  />
                  <Checkbox
                    label="Price"
                    checked={form.showPrice}
                    onChange={(v) => set('showPrice', v)}
                  />
                  <Checkbox
                    label="Variant selector"
                    checked={form.showVariantSelector}
                    onChange={(v) => set('showVariantSelector', v)}
                  />
                  <Checkbox
                    label="Quantity selector"
                    checked={form.showQuantity}
                    onChange={(v) => set('showQuantity', v)}
                  />
                </InlineGrid>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Call to action</Text>
                <TextField
                  label="Button label"
                  autoComplete="off"
                  value={form.ctaLabel}
                  onChange={(v) => set('ctaLabel', v)}
                />
                <InlineGrid columns={{ xs: 1, sm: 2 }} gap="200">
                  <TextField
                    label="Button color"
                    autoComplete="off"
                    value={form.ctaColor}
                    onChange={(v) => set('ctaColor', v)}
                    helpText="Hex, e.g. #7c5cff"
                    prefix={<Swatch color={form.ctaColor} />}
                  />
                  <TextField
                    label="Button text color"
                    autoComplete="off"
                    value={form.ctaTextColor}
                    onChange={(v) => set('ctaTextColor', v)}
                    helpText="Hex, e.g. #ffffff"
                    prefix={<Swatch color={form.ctaTextColor} />}
                  />
                </InlineGrid>
                <Divider />
                <Checkbox
                  label="Show quick-buy button"
                  checked={form.quickBuyEnabled}
                  onChange={(v) => set('quickBuyEnabled', v)}
                  helpText="Adds a secondary button that skips the cart and goes straight to checkout."
                />
                <TextField
                  label="Quick-buy label"
                  autoComplete="off"
                  value={form.quickBuyLabel}
                  onChange={(v) => set('quickBuyLabel', v)}
                  disabled={!form.quickBuyEnabled}
                />
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <BlockStack gap="400">
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Live preview</Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Approximation of how the bar appears on a product page.
                </Text>
                <BarPreview form={form} preview={preview} />
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="200">
                <Text as="h3" variant="headingSm">Where it appears</Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  The bar is delivered by the “Klyna Sticky Cart” theme app embed. Enable
                  it once under Online Store → Themes → Customize → App embeds and it
                  shows on every product page.
                </Text>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

function Swatch({ color }: { color: string }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 14,
        height: 14,
        borderRadius: 4,
        border: '1px solid var(--p-color-border)',
        background: color,
      }}
    />
  );
}

function BarPreview({
  form,
  preview,
}: {
  form: StickyCartSettings;
  preview: PreviewProduct | null;
}) {
  const title = preview?.title ?? 'Sample product';
  const price = preview
    ? new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: preview.currency,
      }).format(Number(preview.price))
    : '$48.00';

  return (
    <Box
      background="bg-surface-secondary"
      borderRadius="300"
      padding="300"
      borderColor="border"
      borderWidth="025"
    >
      <InlineStack gap="200" blockAlign="center" wrap={false}>
        {form.showImage && (
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 8,
              flex: '0 0 auto',
              background: preview?.image
                ? `center / cover no-repeat url(${preview.image})`
                : 'var(--p-color-bg-fill-tertiary)',
            }}
          />
        )}
        <BlockStack gap="0">
          <Text as="span" variant="bodySm" fontWeight="semibold" truncate>
            {title}
          </Text>
          {form.showPrice && (
            <Text as="span" variant="bodySm" tone="subdued">{price}</Text>
          )}
        </BlockStack>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {form.quickBuyEnabled && (
            <button
              type="button"
              disabled
              style={{
                border: '1px solid var(--p-color-border)',
                background: 'transparent',
                color: 'var(--p-color-text)',
                borderRadius: 8,
                padding: '6px 10px',
                fontSize: 12,
                cursor: 'default',
              }}
            >
              {form.quickBuyLabel}
            </button>
          )}
          <button
            type="button"
            disabled
            style={{
              border: 'none',
              background: form.ctaColor,
              color: form.ctaTextColor,
              borderRadius: 8,
              padding: '6px 12px',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'default',
            }}
          >
            {form.ctaLabel}
          </button>
        </div>
      </InlineStack>
    </Box>
  );
}
