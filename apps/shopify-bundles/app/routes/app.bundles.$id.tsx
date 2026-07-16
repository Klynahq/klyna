import { type ActionFunctionArgs, type LoaderFunctionArgs, json, redirect } from '@remix-run/node';
import { useFetcher, useLoaderData, useNavigation, useSubmit } from '@remix-run/react';
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  ChoiceList,
  Divider,
  InlineStack,
  Layout,
  Page,
  Select,
  Text,
  TextField,
  Thumbnail,
} from '@shopify/polaris';
import { useEffect, useState } from 'react';
import prisma from '../db.server';
import { type CatalogProduct, createAutomaticDiscount, searchProducts } from '../lib/admin.server';
import { getPlanSelectionUrl, getShopPlan, planLimitMessage } from '../lib/plans.server';
import { type DiscountType, quoteBundle } from '../lib/pricing';
import { authenticate } from '../shopify.server';

interface DraftItem {
  productGid: string;
  variantGid: string | null;
  title: string;
  imageUrl: string | null;
  price: number;
  quantity: number;
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'bundle'
  );
}

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const isNew = params.id === 'new';
  const plan = await getShopPlan(session.shop, request);
  const upgradeUrl = getPlanSelectionUrl(session.shop);

  if (isNew) {
    const bundleCount = await prisma.bundle.count({ where: { shop: session.shop } });
    return {
      isNew: true,
      plan,
      upgradeUrl,
      limitReached: bundleCount >= plan.maxBundles,
      bundle: {
        id: 'new',
        title: '',
        kind: 'fixed',
        status: 'draft',
        discountType: 'percentage' as DiscountType,
        discountValue: 10,
        minItems: 0,
        items: [] as DraftItem[],
      },
    };
  }

  const bundle = await prisma.bundle.findFirst({
    where: { id: params.id, shop: session.shop },
    include: { items: { orderBy: { position: 'asc' } } },
  });
  if (!bundle) throw new Response('Not found', { status: 404 });

  return {
    isNew: false,
    plan,
    upgradeUrl,
    limitReached: false,
    bundle: {
      id: bundle.id,
      title: bundle.title,
      kind: bundle.kind,
      status: bundle.status,
      discountType: bundle.discountType as DiscountType,
      discountValue: bundle.discountValue,
      minItems: bundle.minItems,
      items: bundle.items.map((it) => ({
        productGid: it.productGid,
        variantGid: it.variantGid,
        title: it.title,
        imageUrl: it.imageUrl,
        price: it.price,
        quantity: it.quantity,
      })) as DraftItem[],
    },
  };
};

export const action = async ({ params, request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();
  const intent = String(form.get('intent') ?? 'save');

  // Live product search for the picker (returns JSON, no navigation).
  if (intent === 'search') {
    const query = String(form.get('query') ?? '');
    const products = await searchProducts(admin, query);
    return json({ products });
  }

  // Parse the submitted bundle payload.
  const payload = JSON.parse(String(form.get('payload') ?? '{}')) as {
    title: string;
    kind: string;
    discountType: DiscountType;
    discountValue: number;
    minItems: number;
    activate: boolean;
    items: DraftItem[];
  };

  const title = payload.title.trim();
  if (!title) return json({ ok: false, error: 'Give the bundle a title.' }, { status: 400 });
  if (payload.items.length < 2) {
    return json({ ok: false, error: 'A bundle needs at least two products.' }, { status: 400 });
  }

  const isNew = params.id === 'new';
  if (isNew) {
    const plan = await getShopPlan(shop, request);
    const bundleCount = await prisma.bundle.count({ where: { shop } });
    if (bundleCount >= plan.maxBundles) {
      return json({ ok: false, error: planLimitMessage(plan, 'bundles') }, { status: 402 });
    }
  }

  const status = payload.activate ? 'active' : 'draft';
  const handle = slugify(title);

  const data = {
    shop,
    title,
    handle,
    kind: payload.kind === 'mix_and_match' ? 'mix_and_match' : 'fixed',
    status,
    discountType: payload.discountType,
    discountValue: Number(payload.discountValue) || 0,
    minItems: payload.kind === 'mix_and_match' ? Math.max(0, Number(payload.minItems) || 0) : 0,
  };

  const bundle = isNew
    ? await prisma.bundle.create({ data })
    : await prisma.bundle.update({ where: { id: params.id }, data });

  // Replace the item set.
  await prisma.bundleItem.deleteMany({ where: { bundleId: bundle.id } });
  await prisma.bundleItem.createMany({
    data: payload.items.map((it, i) => ({
      bundleId: bundle.id,
      productGid: it.productGid,
      variantGid: it.variantGid,
      title: it.title,
      imageUrl: it.imageUrl,
      price: it.price,
      quantity: Math.max(1, it.quantity),
      position: i,
    })),
  });

  // When activating, create a native automatic discount so the savings are
  // actually enforced at checkout for this bundle's products.
  if (status === 'active') {
    try {
      await createAutomaticDiscount(admin, {
        title: `Klyna Bundle · ${title}`,
        percentage: data.discountType === 'percentage' ? data.discountValue / 100 : null,
        amount: data.discountType === 'fixed_amount' ? data.discountValue : null,
        productGids: payload.items.map((it) => it.productGid),
        minQuantity:
          data.kind === 'mix_and_match' ? Math.max(1, data.minItems) : payload.items.length,
      });
    } catch (err) {
      // Surface the failure but keep the bundle saved as draft so the merchant
      // can retry — never silently claim an active discount that wasn't created.
      await prisma.bundle.update({ where: { id: bundle.id }, data: { status: 'draft' } });
      return json(
        {
          ok: false,
          error:
            err instanceof Error
              ? `Saved as draft — discount could not be created: ${err.message}`
              : 'Saved as draft — discount could not be created.',
        },
        { status: 502 },
      );
    }
  }

  return redirect('/app/bundles');
};

export default function BundleBuilder() {
  const { isNew, bundle, plan, upgradeUrl, limitReached } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const nav = useNavigation();
  const searchFetcher = useFetcher<{ products: CatalogProduct[] }>();

  const [title, setTitle] = useState(bundle.title);
  const [kind, setKind] = useState<string>(bundle.kind);
  const [discountType, setDiscountType] = useState<DiscountType>(bundle.discountType);
  const [discountValue, setDiscountValue] = useState(String(bundle.discountValue));
  const [minItems, setMinItems] = useState(String(bundle.minItems));
  const [items, setItems] = useState<DraftItem[]>(bundle.items);
  const [query, setQuery] = useState('');

  const saving = nav.state === 'submitting';
  const results = searchFetcher.data?.products ?? [];
  const submitSearch = searchFetcher.submit;

  // Debounced product search.
  useEffect(() => {
    const handle = setTimeout(() => {
      const fd = new FormData();
      fd.set('intent', 'search');
      fd.set('query', query);
      submitSearch(fd, { method: 'post' });
    }, 250);
    return () => clearTimeout(handle);
  }, [query, submitSearch]);

  const addItem = (p: CatalogProduct) => {
    if (items.some((it) => it.productGid === p.gid)) return;
    setItems((prev) => [
      ...prev,
      {
        productGid: p.gid,
        variantGid: p.variantGid,
        title: p.title,
        imageUrl: p.imageUrl,
        price: p.price,
        quantity: 1,
      },
    ]);
  };

  const removeItem = (gid: string) =>
    setItems((prev) => prev.filter((it) => it.productGid !== gid));

  const setQty = (gid: string, qty: number) =>
    setItems((prev) =>
      prev.map((it) => (it.productGid === gid ? { ...it, quantity: Math.max(1, qty) } : it)),
    );

  const quote = quoteBundle(
    items.map((it) => ({ price: it.price, quantity: it.quantity })),
    discountType,
    Number(discountValue) || 0,
  );

  const save = (activate: boolean) => {
    const payload = {
      title,
      kind,
      discountType,
      discountValue: Number(discountValue) || 0,
      minItems: Number(minItems) || 0,
      activate,
      items,
    };
    const fd = new FormData();
    fd.set('intent', 'save');
    fd.set('payload', JSON.stringify(payload));
    submit(fd, { method: 'post' });
  };

  return (
    <Page
      title={isNew ? 'New bundle' : 'Edit bundle'}
      backAction={{ url: '/app/bundles' }}
      primaryAction={{
        content: 'Save & activate',
        loading: saving,
        disabled: limitReached || items.length < 2 || !title.trim(),
        onAction: () => save(true),
      }}
      secondaryActions={[
        { content: 'Save draft', onAction: () => save(false), disabled: saving || limitReached },
      ]}
    >
      <Layout>
        {isNew && limitReached && (
          <Layout.Section>
            <Banner tone="warning" title={`${plan.label} bundle limit reached`}>
              <Text as="p" variant="bodyMd">
                Starter includes one bundle.{' '}
                <a href={upgradeUrl} target="_top" rel="noreferrer">
                  View paid plans
                </a>{' '}
                to create more bundles and quantity-break tiers.
              </Text>
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <BlockStack gap="400">
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Bundle details
                </Text>
                <TextField
                  label="Title"
                  value={title}
                  onChange={setTitle}
                  autoComplete="off"
                  placeholder="Starter kit"
                />
                <ChoiceList
                  title="Bundle type"
                  choices={[
                    { label: 'Fixed set — sold together', value: 'fixed' },
                    { label: 'Mix & match — customer picks from the pool', value: 'mix_and_match' },
                  ]}
                  selected={[kind]}
                  onChange={(v) => setKind(v[0] ?? 'fixed')}
                />
                {kind === 'mix_and_match' && (
                  <TextField
                    label="Minimum items the customer must pick"
                    type="number"
                    min={1}
                    value={minItems}
                    onChange={setMinItems}
                    autoComplete="off"
                  />
                )}
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Products
                </Text>
                {items.length === 0 ? (
                  <Text as="p" tone="subdued">
                    Search and add at least two products.
                  </Text>
                ) : (
                  <BlockStack gap="200">
                    {items.map((it) => (
                      <InlineStack
                        key={it.productGid}
                        align="space-between"
                        blockAlign="center"
                        wrap={false}
                      >
                        <InlineStack gap="300" blockAlign="center">
                          <Thumbnail
                            source={
                              it.imageUrl ??
                              'https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png'
                            }
                            alt={it.title}
                            size="small"
                          />
                          <BlockStack gap="0">
                            <Text as="span" variant="bodyMd">
                              {it.title}
                            </Text>
                            <Text as="span" variant="bodySm" tone="subdued">
                              {it.price.toFixed(2)} each
                            </Text>
                          </BlockStack>
                        </InlineStack>
                        <InlineStack gap="200" blockAlign="center">
                          <Box width="72px">
                            <TextField
                              label="Qty"
                              labelHidden
                              type="number"
                              min={1}
                              value={String(it.quantity)}
                              onChange={(v) => setQty(it.productGid, Number(v) || 1)}
                              autoComplete="off"
                            />
                          </Box>
                          <Button
                            variant="tertiary"
                            tone="critical"
                            onClick={() => removeItem(it.productGid)}
                          >
                            Remove
                          </Button>
                        </InlineStack>
                      </InlineStack>
                    ))}
                  </BlockStack>
                )}

                <Divider />

                <TextField
                  label="Add products"
                  value={query}
                  onChange={setQuery}
                  autoComplete="off"
                  placeholder="Search by title or SKU"
                  loading={searchFetcher.state !== 'idle'}
                />
                {results.length > 0 && (
                  <BlockStack gap="100">
                    {results.slice(0, 8).map((p) => {
                      const added = items.some((it) => it.productGid === p.gid);
                      return (
                        <InlineStack
                          key={p.gid}
                          align="space-between"
                          blockAlign="center"
                          wrap={false}
                        >
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
                          <Button size="slim" disabled={added} onClick={() => addItem(p)}>
                            {added ? 'Added' : 'Add'}
                          </Button>
                        </InlineStack>
                      );
                    })}
                  </BlockStack>
                )}
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <BlockStack gap="400">
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Discount
                </Text>
                <Select
                  label="Type"
                  options={[
                    { label: 'Percentage off', value: 'percentage' },
                    { label: 'Fixed amount off', value: 'fixed_amount' },
                  ]}
                  value={discountType}
                  onChange={(v) => setDiscountType(v as DiscountType)}
                />
                <TextField
                  label={discountType === 'percentage' ? 'Percent off' : 'Amount off'}
                  type="number"
                  min={0}
                  value={discountValue}
                  onChange={setDiscountValue}
                  suffix={discountType === 'percentage' ? '%' : undefined}
                  autoComplete="off"
                />
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  Price preview
                </Text>
                <InlineStack align="space-between">
                  <Text as="span" tone="subdued">
                    Subtotal
                  </Text>
                  <Text as="span">
                    <s>{quote.subtotal.toFixed(2)}</s>
                  </Text>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text as="span" tone="subdued">
                    Bundle price
                  </Text>
                  <Text as="span" variant="headingMd" fontWeight="bold">
                    {quote.total.toFixed(2)}
                  </Text>
                </InlineStack>
                {quote.savings > 0 && (
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="span" tone="success">
                      You save {quote.savings.toFixed(2)}
                    </Text>
                    <Badge tone="success">{`Save ${quote.savingsPercent}%`}</Badge>
                  </InlineStack>
                )}
                <Text as="p" variant="bodySm" tone="subdued">
                  This is exactly what the storefront block renders — the math is shared.
                </Text>
              </BlockStack>
            </Card>

            <Banner tone="info">
              Activating creates a native automatic discount so the saving is enforced at checkout.
            </Banner>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
