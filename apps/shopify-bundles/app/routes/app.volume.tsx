import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/node';
import { useFetcher, useLoaderData } from '@remix-run/react';
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  DataTable,
  Divider,
  InlineGrid,
  InlineStack,
  Layout,
  Page,
  Select,
  Text,
  TextField,
  Thumbnail,
} from '@shopify/polaris';
import { useEffect, useMemo, useState } from 'react';
import prisma from '../db.server';
import { type CatalogProduct, createAutomaticDiscount, searchProducts } from '../lib/admin.server';
import { getPlanSelectionUrl, getShopPlan, planLimitMessage } from '../lib/plans.server';
import {
  type DiscountType,
  type VolumeTierInput,
  normalizeTiers,
  quoteVolume,
} from '../lib/pricing';
import { authenticate } from '../shopify.server';

interface DraftTier {
  id: string;
  minQuantity: number;
  discountType: DiscountType;
  discountValue: number;
}

function tierId(): string {
  return `tier-${Math.random().toString(36).slice(2)}`;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const plan = await getShopPlan(session.shop, request);
  const tiers = await prisma.volumeTier.findMany({
    where: { shop: session.shop },
    orderBy: [{ productTitle: 'asc' }, { minQuantity: 'asc' }],
  });

  // Group tiers by product for display.
  const grouped = new Map<
    string,
    { productGid: string; productTitle: string; tiers: typeof tiers }
  >();
  for (const t of tiers) {
    const g = grouped.get(t.productGid) ?? {
      productGid: t.productGid,
      productTitle: t.productTitle,
      tiers: [] as typeof tiers,
    };
    g.tiers.push(t);
    grouped.set(t.productGid, g);
  }

  return { groups: [...grouped.values()], plan, upgradeUrl: getPlanSelectionUrl(session.shop) };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();
  const intent = String(form.get('intent') ?? '');

  if (intent === 'search') {
    const products = await searchProducts(admin, String(form.get('query') ?? ''));
    return json({ products });
  }

  const plan = await getShopPlan(shop, request);

  if (intent === 'deleteProduct') {
    const productGid = String(form.get('productGid') ?? '');
    await prisma.volumeTier.deleteMany({ where: { shop, productGid } });
    return json({ ok: true });
  }

  if (intent === 'save') {
    if (!plan.canUseVolume) {
      return json({ ok: false, error: planLimitMessage(plan, 'volume') }, { status: 402 });
    }

    const product = JSON.parse(String(form.get('product') ?? '{}')) as CatalogProduct;
    const rawTiers = JSON.parse(String(form.get('tiers') ?? '[]')) as DraftTier[];
    if (!product.gid) return json({ ok: false, error: 'Pick a product first.' }, { status: 400 });

    const existingProductRows = await prisma.volumeTier.findMany({
      where: { shop },
      select: { productGid: true },
    });
    const existingProductGids = new Set(existingProductRows.map((row) => row.productGid));
    if (
      !existingProductGids.has(product.gid) &&
      existingProductGids.size >= plan.maxVolumeProducts
    ) {
      return json(
        {
          ok: false,
          error: `${plan.label} includes ${plan.maxVolumeProducts} volume products. Upgrade for more capacity.`,
        },
        { status: 402 },
      );
    }

    const clean = normalizeTiers(
      rawTiers
        .filter((t) => t.minQuantity >= 2 && t.discountValue > 0)
        .map((t) => ({ ...t, minQuantity: Math.floor(t.minQuantity) })),
    );
    if (clean.length === 0) {
      return json({ ok: false, error: 'Add at least one tier (min qty ≥ 2).' }, { status: 400 });
    }

    // Replace this product's tier ladder.
    await prisma.volumeTier.deleteMany({ where: { shop, productGid: product.gid } });
    await prisma.volumeTier.createMany({
      data: clean.map((t) => ({
        shop,
        productGid: product.gid,
        productTitle: product.title,
        minQuantity: t.minQuantity,
        discountType: t.discountType,
        discountValue: t.discountValue,
        label: `Buy ${t.minQuantity}+`,
      })),
    });

    // Create one native automatic discount per break point so checkout enforces
    // the best applicable tier for the quantity in cart.
    const errors: string[] = [];
    for (const t of clean) {
      try {
        await createAutomaticDiscount(admin, {
          title: `Klyna Volume · ${product.title} · ${t.minQuantity}+`,
          percentage: t.discountType === 'percentage' ? t.discountValue / 100 : null,
          amount: t.discountType === 'fixed_amount' ? t.discountValue : null,
          productGids: [product.gid],
          minQuantity: t.minQuantity,
        });
      } catch (err) {
        errors.push(err instanceof Error ? err.message : 'discount error');
      }
    }

    if (errors.length > 0) {
      return json(
        { ok: false, error: `Tiers saved, but some discounts failed: ${errors.join('; ')}` },
        { status: 502 },
      );
    }
    return json({ ok: true });
  }

  return json({ ok: false, error: 'Unknown intent' }, { status: 400 });
};

const SAMPLE_PRICE = 20;

export default function VolumeDiscounts() {
  const { groups, plan, upgradeUrl } = useLoaderData<typeof loader>();
  const searchFetcher = useFetcher<{ products: CatalogProduct[] }>();
  const saveFetcher = useFetcher<{ ok: boolean; error?: string }>();

  const [query, setQuery] = useState('');
  const [product, setProduct] = useState<CatalogProduct | null>(null);
  const [tiers, setTiers] = useState<DraftTier[]>([
    { id: 'tier-2', minQuantity: 2, discountType: 'percentage', discountValue: 5 },
    { id: 'tier-5', minQuantity: 5, discountType: 'percentage', discountValue: 10 },
  ]);

  const results = searchFetcher.data?.products ?? [];
  const submitSearch = searchFetcher.submit;

  useEffect(() => {
    const h = setTimeout(() => {
      const fd = new FormData();
      fd.set('intent', 'search');
      fd.set('query', query);
      submitSearch(fd, { method: 'post' });
    }, 250);
    return () => clearTimeout(h);
  }, [query, submitSearch]);

  const setTier = (i: number, patch: Partial<DraftTier>) =>
    setTiers((prev) => prev.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  const addTier = () =>
    setTiers((prev) => [
      ...prev,
      {
        id: tierId(),
        minQuantity: (prev.at(-1)?.minQuantity ?? 1) + 5,
        discountType: 'percentage',
        discountValue: 15,
      },
    ]);
  const removeTier = (i: number) => setTiers((prev) => prev.filter((_, idx) => idx !== i));

  const unitPrice = product?.price ?? SAMPLE_PRICE;
  const tierInputs: VolumeTierInput[] = useMemo(
    () =>
      tiers.map((t) => ({
        minQuantity: t.minQuantity,
        discountType: t.discountType,
        discountValue: t.discountValue,
      })),
    [tiers],
  );

  // Preview rows at each break point.
  const previewRows = useMemo(() => {
    return [...tiers]
      .sort((a, b) => a.minQuantity - b.minQuantity)
      .map((t) => {
        const q = quoteVolume(unitPrice, t.minQuantity, tierInputs);
        return [
          `${t.minQuantity}+`,
          unitPrice.toFixed(2),
          q.effectiveUnitPrice.toFixed(2),
          q.lineTotal.toFixed(2),
          q.savings > 0 ? `-${q.savings.toFixed(2)}` : '—',
        ];
      });
  }, [tiers, tierInputs, unitPrice]);

  const save = () => {
    if (!product) return;
    const fd = new FormData();
    fd.set('intent', 'save');
    fd.set('product', JSON.stringify(product));
    fd.set('tiers', JSON.stringify(tiers));
    saveFetcher.submit(fd, { method: 'post' });
  };

  const saving = saveFetcher.state !== 'idle';
  const saveError = saveFetcher.data && !saveFetcher.data.ok ? saveFetcher.data.error : null;
  const saved = saveFetcher.data?.ok;

  const deleteProduct = (productGid: string) => {
    const fd = new FormData();
    fd.set('intent', 'deleteProduct');
    fd.set('productGid', productGid);
    saveFetcher.submit(fd, { method: 'post' });
  };

  if (!plan.canUseVolume) {
    return (
      <Page
        title="Volume discounts"
        backAction={{ url: '/app' }}
        subtitle="Buy more, save more — quantity break tiers."
      >
        <Layout>
          <Layout.Section>
            <Banner tone="warning" title="Volume discounts are included in paid plans">
              <Text as="p" variant="bodyMd">
                Starter includes one bundle.{' '}
                <a href={upgradeUrl} target="_top" rel="noreferrer">
                  View paid plans
                </a>{' '}
                to create quantity-break tiers with native automatic discounts.
              </Text>
            </Banner>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  return (
    <Page
      title="Volume discounts"
      backAction={{ url: '/app' }}
      subtitle="Buy more, save more — quantity break tiers."
    >
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Build a tier ladder
              </Text>

              {product ? (
                <InlineStack align="space-between" blockAlign="center">
                  <InlineStack gap="300" blockAlign="center">
                    <Thumbnail
                      source={
                        product.imageUrl ??
                        'https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png'
                      }
                      alt={product.title}
                      size="small"
                    />
                    <BlockStack gap="0">
                      <Text as="span" variant="bodyMd" fontWeight="semibold">
                        {product.title}
                      </Text>
                      <Text as="span" variant="bodySm" tone="subdued">
                        {product.price.toFixed(2)} base price
                      </Text>
                    </BlockStack>
                  </InlineStack>
                  <Button variant="tertiary" onClick={() => setProduct(null)}>
                    Change
                  </Button>
                </InlineStack>
              ) : (
                <BlockStack gap="200">
                  <TextField
                    label="Product"
                    value={query}
                    onChange={setQuery}
                    autoComplete="off"
                    placeholder="Search by title or SKU"
                    loading={searchFetcher.state !== 'idle'}
                  />
                  {results.slice(0, 8).map((p) => (
                    <InlineStack key={p.gid} align="space-between" blockAlign="center" wrap={false}>
                      <InlineStack gap="300" blockAlign="center">
                        <Thumbnail
                          source={
                            p.imageUrl ??
                            'https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png'
                          }
                          alt={p.title}
                          size="small"
                        />
                        <Text as="span" variant="bodyMd">
                          {p.title}
                        </Text>
                      </InlineStack>
                      <Button
                        size="slim"
                        onClick={() => {
                          setProduct(p);
                          setQuery('');
                        }}
                      >
                        Select
                      </Button>
                    </InlineStack>
                  ))}
                </BlockStack>
              )}

              <Divider />

              <BlockStack gap="200">
                {tiers.map((t, i) => (
                  <InlineGrid key={t.id} columns={{ xs: 1, sm: 4 }} gap="200" alignItems="end">
                    <TextField
                      label="Min quantity"
                      type="number"
                      min={2}
                      value={String(t.minQuantity)}
                      onChange={(v) => setTier(i, { minQuantity: Number(v) || 2 })}
                      autoComplete="off"
                    />
                    <Select
                      label="Type"
                      options={[
                        { label: 'Percent', value: 'percentage' },
                        { label: 'Fixed', value: 'fixed_amount' },
                      ]}
                      value={t.discountType}
                      onChange={(v) => setTier(i, { discountType: v as DiscountType })}
                    />
                    <TextField
                      label="Value"
                      type="number"
                      min={0}
                      value={String(t.discountValue)}
                      onChange={(v) => setTier(i, { discountValue: Number(v) || 0 })}
                      suffix={t.discountType === 'percentage' ? '%' : undefined}
                      autoComplete="off"
                    />
                    <Button variant="tertiary" tone="critical" onClick={() => removeTier(i)}>
                      Remove
                    </Button>
                  </InlineGrid>
                ))}
                <Box>
                  <Button variant="tertiary" onClick={addTier}>
                    + Add tier
                  </Button>
                </Box>
              </BlockStack>

              {saveError && <Banner tone="critical">{saveError}</Banner>}
              {saved && (
                <Banner tone="success">Tiers saved and automatic discounts created.</Banner>
              )}

              <InlineStack align="end">
                <Button variant="primary" loading={saving} disabled={!product} onClick={save}>
                  Save tiers
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">
                Preview
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                At {unitPrice.toFixed(2)} per unit{product ? '' : ' (sample)'}:
              </Text>
              <DataTable
                columnContentTypes={['text', 'numeric', 'numeric', 'numeric', 'numeric']}
                headings={['Qty', 'Was', 'Now', 'Line', 'Save']}
                rows={previewRows}
              />
            </BlockStack>
          </Card>
        </Layout.Section>

        {groups.length > 0 && (
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Live tiers
                </Text>
                {groups.map((g) => (
                  <Box key={g.productGid}>
                    <InlineStack align="space-between" blockAlign="center">
                      <Text as="span" variant="bodyMd" fontWeight="semibold">
                        {g.productTitle}
                      </Text>
                      <Button
                        variant="tertiary"
                        tone="critical"
                        onClick={() => deleteProduct(g.productGid)}
                      >
                        Remove all
                      </Button>
                    </InlineStack>
                    <InlineStack gap="200">
                      {g.tiers.map((t) => (
                        <Badge key={t.id} tone="success">
                          {`${t.label}: ${t.discountValue}${t.discountType === 'percentage' ? '%' : ''} off`}
                        </Badge>
                      ))}
                    </InlineStack>
                    <Box paddingBlockStart="200">
                      <Divider />
                    </Box>
                  </Box>
                ))}
              </BlockStack>
            </Card>
          </Layout.Section>
        )}
      </Layout>
    </Page>
  );
}
