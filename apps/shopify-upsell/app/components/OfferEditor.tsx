import { useCallback, useState } from 'react';
import { Form } from '@remix-run/react';
import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  Checkbox,
  ChoiceList,
  InlineStack,
  Layout,
  RangeSlider,
  Select,
  Text,
  TextField,
  Thumbnail,
} from '@shopify/polaris';
import { useAppBridge } from '@shopify/app-bridge-react';

// A product snapshot the editor holds in state and posts as hidden fields.
export interface PickedProduct {
  productGid: string;
  productHandle: string;
  productTitle: string;
  productImage: string | null;
  headline: string;
  ctaText: string;
  discountPercent: number;
}

export interface OfferEditorValues {
  name: string;
  enabled: boolean;
  triggerType: 'product' | 'collection' | 'cart_value';
  triggerValue: string;
  triggerLabel: string;
  placement: 'cart';
  splitA: number;
  a: PickedProduct;
  b: PickedProduct | null;
}

export const EMPTY_VARIANT: PickedProduct = {
  productGid: '',
  productHandle: '',
  productTitle: '',
  productImage: null,
  headline: 'You might also like',
  ctaText: 'Add to order',
  discountPercent: 0,
};

export const EMPTY_OFFER: OfferEditorValues = {
  name: '',
  enabled: true,
  triggerType: 'product',
  triggerValue: '',
  triggerLabel: '',
  placement: 'cart',
  splitA: 50,
  a: { ...EMPTY_VARIANT },
  b: null,
};

interface ResourcePickerSelection {
  id: string;
  title?: string;
  handle?: string;
  images?: Array<{ originalSrc?: string }>;
}

export function OfferEditor({
  initial,
  errors,
  submitting,
}: {
  initial: OfferEditorValues;
  errors: string[];
  submitting: boolean;
}) {
  const shopify = useAppBridge();
  const [values, setValues] = useState<OfferEditorValues>(initial);

  const set = useCallback(<K extends keyof OfferEditorValues>(key: K, v: OfferEditorValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: v }));
  }, []);

  const setVariant = useCallback(
    (which: 'a' | 'b', patch: Partial<PickedProduct>) => {
      setValues((prev) => {
        const base = which === 'a' ? prev.a : prev.b ?? { ...EMPTY_VARIANT };
        return { ...prev, [which]: { ...base, ...patch } };
      });
    },
    [],
  );

  // Open the App Bridge product picker for a variant.
  const pickVariantProduct = useCallback(
    async (which: 'a' | 'b') => {
      const selected = (await shopify.resourcePicker({
        type: 'product',
        action: 'select',
      })) as ResourcePickerSelection[] | undefined;
      const product = selected?.[0];
      if (!product) return;
      setVariant(which, {
        productGid: product.id,
        productHandle: product.handle ?? '',
        productTitle: product.title ?? 'Selected product',
        productImage: product.images?.[0]?.originalSrc ?? null,
      });
    },
    [shopify, setVariant],
  );

  // Open the picker for the trigger (product or collection).
  const pickTrigger = useCallback(async () => {
    const type = values.triggerType === 'collection' ? 'collection' : 'product';
    const selected = (await shopify.resourcePicker({
      type,
      action: 'select',
    })) as ResourcePickerSelection[] | undefined;
    const item = selected?.[0];
    if (!item) return;
    setValues((prev) => ({
      ...prev,
      triggerValue: item.id,
      triggerLabel: item.title ?? item.id,
    }));
  }, [shopify, values.triggerType]);

  const showB = values.b !== null;

  return (
    <Form method="post">
      {/* Hidden fields carry the picked GIDs/snapshots the form UI can't natively post. */}
      <input type="hidden" name="triggerValue" value={values.triggerValue} />
      <input type="hidden" name="a.productGid" value={values.a.productGid} />
      <input type="hidden" name="a.productHandle" value={values.a.productHandle} />
      <input type="hidden" name="a.productTitle" value={values.a.productTitle} />
      <input type="hidden" name="a.productImage" value={values.a.productImage ?? ''} />
      {showB && values.b && (
        <>
          <input type="hidden" name="b.productGid" value={values.b.productGid} />
          <input type="hidden" name="b.productHandle" value={values.b.productHandle} />
          <input type="hidden" name="b.productTitle" value={values.b.productTitle} />
          <input type="hidden" name="b.productImage" value={values.b.productImage ?? ''} />
        </>
      )}

      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {errors.length > 0 && (
              <Card>
                <BlockStack gap="100">
                  {errors.map((e) => (
                    <Text as="p" tone="critical" key={e}>{e}</Text>
                  ))}
                </BlockStack>
              </Card>
            )}

            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Basics</Text>
                <TextField
                  label="Offer name"
                  name="name"
                  value={values.name}
                  onChange={(v) => set('name', v)}
                  autoComplete="off"
                  helpText="Internal label — shoppers never see this."
                />
                <Checkbox
                  label="Offer is live"
                  checked={values.enabled}
                  onChange={(v) => set('enabled', v)}
                />
                {/* Polaris Checkbox isn't a submittable input — mirror its state
                    into a hidden field the action reads. */}
                <input type="hidden" name="enabled" value={values.enabled ? 'on' : 'off'} />
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Trigger</Text>
                <Text as="p" tone="subdued">When should this offer appear?</Text>
                <ChoiceList
                  title="Trigger type"
                  titleHidden
                  choices={[
                    { label: 'A specific product is in the cart', value: 'product' },
                    { label: 'Any product from a collection is in the cart', value: 'collection' },
                    { label: 'Cart subtotal reaches a threshold', value: 'cart_value' },
                  ]}
                  selected={[values.triggerType]}
                  onChange={(sel) => {
                    const next = (sel[0] ?? 'product') as OfferEditorValues['triggerType'];
                    setValues((prev) => ({ ...prev, triggerType: next, triggerValue: '', triggerLabel: '' }));
                  }}
                />
                <input type="hidden" name="triggerType" value={values.triggerType} />

                {values.triggerType === 'cart_value' ? (
                  <TextField
                    label="Minimum cart subtotal (cents)"
                    type="number"
                    value={values.triggerValue}
                    onChange={(v) => set('triggerValue', v)}
                    autoComplete="off"
                    prefix="¢"
                    helpText="e.g. 5000 shows the offer once the cart reaches $50.00."
                  />
                ) : (
                  <InlineStack gap="300" blockAlign="center">
                    <Button onClick={pickTrigger}>
                      {values.triggerType === 'collection' ? 'Choose collection' : 'Choose product'}
                    </Button>
                    {values.triggerLabel && <Badge tone="info">{values.triggerLabel}</Badge>}
                  </InlineStack>
                )}
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Placement</Text>
                <Select
                  label="Where the offer shows"
                  name="placement"
                  options={[
                    { label: 'In-cart widget (cart drawer)', value: 'cart' },
                  ]}
                  value={values.placement}
                  onChange={() => set('placement', 'cart')}
                />
              </BlockStack>
            </Card>

            <VariantCard
              title="Recommendation (variant A)"
              variant={values.a}
              onPick={() => pickVariantProduct('a')}
              onChange={(patch) => setVariant('a', patch)}
              prefix="a"
            />

            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">A/B test (variant B)</Text>
                  <Button
                    variant="tertiary"
                    onClick={() =>
                      setValues((prev) => ({ ...prev, b: prev.b ? null : { ...EMPTY_VARIANT } }))
                    }
                  >
                    {showB ? 'Remove variant B' : 'Add variant B'}
                  </Button>
                </InlineStack>
                {showB && values.b ? (
                  <BlockStack gap="300">
                    <VariantFields
                      variant={values.b}
                      onPick={() => pickVariantProduct('b')}
                      onChange={(patch) => setVariant('b', patch)}
                      prefix="b"
                    />
                    <Box paddingBlockStart="200">
                      <RangeSlider
                        label={`Traffic split — ${values.splitA}% A / ${100 - values.splitA}% B`}
                        value={values.splitA}
                        min={0}
                        max={100}
                        onChange={(v) => set('splitA', Array.isArray(v) ? (v[0] ?? 50) : v)}
                        output
                      />
                      <input type="hidden" name="splitA" value={values.splitA} />
                    </Box>
                  </BlockStack>
                ) : (
                  <Text as="p" tone="subdued">
                    Add a second recommendation to split-test it against variant A.
                    Klyna routes traffic by the split you choose and reports a
                    winner in Analytics.
                  </Text>
                )}
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Save</Text>
              <Text as="p" tone="subdued">
                Changes go live immediately on the storefront once the offer is
                enabled and the theme widget block is added.
              </Text>
              <Button submit variant="primary" loading={submitting}>
                Save offer
              </Button>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Form>
  );
}

function VariantCard({
  title,
  variant,
  onPick,
  onChange,
  prefix,
}: {
  title: string;
  variant: PickedProduct;
  onPick: () => void;
  onChange: (patch: Partial<PickedProduct>) => void;
  prefix: string;
}) {
  return (
    <Card>
      <BlockStack gap="300">
        <Text as="h2" variant="headingMd">{title}</Text>
        <VariantFields variant={variant} onPick={onPick} onChange={onChange} prefix={prefix} />
      </BlockStack>
    </Card>
  );
}

function VariantFields({
  variant,
  onPick,
  onChange,
  prefix,
}: {
  variant: PickedProduct;
  onPick: () => void;
  onChange: (patch: Partial<PickedProduct>) => void;
  prefix: string;
}) {
  return (
    <BlockStack gap="300">
      <InlineStack gap="300" blockAlign="center">
        {variant.productImage && (
          <Thumbnail source={variant.productImage} alt={variant.productTitle} size="small" />
        )}
        <Button onClick={onPick}>
          {variant.productGid ? 'Change product' : 'Choose product'}
        </Button>
        {variant.productTitle && <Text as="span" fontWeight="semibold">{variant.productTitle}</Text>}
      </InlineStack>
      <TextField
        label="Headline"
        name={`${prefix}.headline`}
        value={variant.headline}
        onChange={(v) => onChange({ headline: v })}
        autoComplete="off"
      />
      <TextField
        label="Button text"
        name={`${prefix}.ctaText`}
        value={variant.ctaText}
        onChange={(v) => onChange({ ctaText: v })}
        autoComplete="off"
      />
      <TextField
        label="Discount on the upsell (%)"
        name={`${prefix}.discountPercent`}
        type="number"
        value={String(variant.discountPercent)}
        onChange={(v) => onChange({ discountPercent: Number(v) || 0 })}
        autoComplete="off"
        suffix="%"
        helpText="0 means no discount. A positive value creates an auto-applied discount when accepted."
      />
    </BlockStack>
  );
}
