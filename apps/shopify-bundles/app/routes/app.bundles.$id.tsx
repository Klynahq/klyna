import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
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
import { withAdminSessionRecovery } from '../lib/admin-session-recovery.server';
import {
  type CatalogProduct,
  getProductsByIds,
  searchProducts,
  syncBundleDiscount,
} from '../lib/admin.server';
import { useAuthenticatedAction } from '../lib/authenticated-action';
import { useEmbeddedRoute } from '../lib/embedded-routes';
import { getPlanSelectionUrl, getShopPlan, planLimitMessage } from '../lib/plans.server';
import { type DiscountType, quoteBundle } from '../lib/pricing';
import { recordUsageEvent } from '../lib/usage.server';
import { authenticate } from '../shopify.server';

interface DraftItem {
  productGid: string;
  variantGid: string | null;
  title: string;
  imageUrl: string | null;
  price: number;
  quantity: number;
  available: boolean;
  availabilityReason: CatalogProduct['availabilityReason'];
}

const AVAILABILITY_LABEL: Record<CatalogProduct['availabilityReason'], string> = {
  available: 'Ready for Online Store',
  unpublished: 'Not published to Online Store',
  out_of_stock: 'Out of stock',
  no_variant: 'No purchasable variant',
};

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
  const { admin, session } = await authenticate.admin(request);
  const isNew = params.id === 'new';
  const plan = await getShopPlan(session.shop, request);
  const upgradeUrl = getPlanSelectionUrl(session.shop);

  if (isNew) {
    const [bundleCount, starterProducts] = await Promise.all([
      prisma.bundle.count({ where: { shop: session.shop } }),
      withAdminSessionRecovery(session, () => searchProducts(admin, '', 12)).catch(() => []),
      recordUsageEvent(session.shop, 'bundle_builder_opened'),
    ]);
    return {
      isNew: true,
      plan,
      upgradeUrl,
      limitReached: bundleCount >= plan.maxBundles,
      starterProducts,
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

  const refreshedProducts = await withAdminSessionRecovery(session, () =>
    getProductsByIds(
      admin,
      bundle.items.map((item) => item.productGid),
    ),
  ).catch(() => []);
  const refreshedByGid = new Map(refreshedProducts.map((product) => [product.gid, product]));

  return {
    isNew: false,
    plan,
    upgradeUrl,
    limitReached: false,
    starterProducts: [] as CatalogProduct[],
    bundle: {
      id: bundle.id,
      title: bundle.title,
      kind: bundle.kind,
      status: bundle.status,
      discountType: bundle.discountType as DiscountType,
      discountValue: bundle.discountValue,
      minItems: bundle.minItems,
      items: bundle.items.map((it) => {
        const product = refreshedByGid.get(it.productGid);
        return {
          productGid: it.productGid,
          variantGid: product?.variantGid ?? it.variantGid,
          title: product?.title ?? it.title,
          imageUrl: product?.imageUrl ?? it.imageUrl,
          price: product?.price ?? it.price,
          quantity: it.quantity,
          available: product?.available ?? false,
          availabilityReason: product?.availabilityReason ?? 'unpublished',
        };
      }) as DraftItem[],
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
    const products = await withAdminSessionRecovery(session, () => searchProducts(admin, query));
    await recordUsageEvent(shop, 'catalog_searched');
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

  const refreshedProducts = await withAdminSessionRecovery(session, () =>
    getProductsByIds(
      admin,
      payload.items.map((item) => item.productGid),
    ),
  );
  const refreshedByGid = new Map(refreshedProducts.map((product) => [product.gid, product]));
  const normalizedItems = payload.items.map((item) => {
    const product = refreshedByGid.get(item.productGid);
    return product
      ? {
          productGid: product.gid,
          variantGid: product.variantGid,
          title: product.title,
          imageUrl: product.imageUrl,
          price: product.price,
          quantity: Math.max(1, item.quantity),
          available: product.available,
          availabilityReason: product.availabilityReason,
        }
      : { ...item, available: false, availabilityReason: 'unpublished' as const };
  });

  if (payload.activate) {
    const unavailable = normalizedItems.filter((item) => !item.available);
    if (unavailable.length > 0) {
      return json(
        {
          ok: false,
          error: `Cannot activate yet: ${unavailable
            .map((item) => `${item.title} (${AVAILABILITY_LABEL[item.availabilityReason]})`)
            .join(', ')}. Publish the product and make a variant available first.`,
        },
        { status: 400 },
      );
    }
  }

  const isNew = params.id === 'new';
  const existingBundle = isNew
    ? null
    : await prisma.bundle.findFirst({
        where: { id: params.id, shop },
        include: { items: true },
      });
  if (!isNew && !existingBundle) {
    return json({ ok: false, error: 'Bundle not found.' }, { status: 404 });
  }

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

  const discountTitle = `Klyna Bundle · ${title}`;
  let discountGid = existingBundle?.discountGid ?? null;

  // Synchronize Shopify first so Klyna never reports an active state when the
  // checkout discount failed. Exact-title lookup adopts discounts made by
  // builds that predate persisted discount IDs.
  if (!isNew || status === 'active') {
    try {
      discountGid = await withAdminSessionRecovery(session, () =>
        syncBundleDiscount(admin, {
          discountGid,
          previousTitle: `Klyna Bundle · ${existingBundle?.title ?? title}`,
          active: status === 'active',
          discount: {
            title: discountTitle,
            kind: data.kind as 'fixed' | 'mix_and_match',
            items: normalizedItems.map((item) => ({
              productGid: item.productGid,
              variantGid: item.variantGid,
              quantity: Math.max(1, item.quantity),
            })),
            minItems: data.minItems,
            discountType: data.discountType,
            discountValue: data.discountValue,
          },
        }),
      );
    } catch (err) {
      if (err instanceof Response) throw err;
      return json(
        {
          ok: false,
          error:
            err instanceof Error
              ? `Bundle was not changed — checkout discount could not be synchronized: ${err.message}`
              : 'Bundle was not changed — checkout discount could not be synchronized.',
        },
        { status: 502 },
      );
    }
  }

  const bundle = await prisma.$transaction(async (tx) => {
    const saved = isNew
      ? await tx.bundle.create({ data: { ...data, discountGid } })
      : await tx.bundle.update({
          where: { id: existingBundle?.id },
          data: { ...data, discountGid },
        });

    await tx.bundleItem.deleteMany({ where: { bundleId: saved.id } });
    await tx.bundleItem.createMany({
      data: normalizedItems.map((it, i) => ({
        bundleId: saved.id,
        productGid: it.productGid,
        variantGid: it.variantGid,
        title: it.title,
        imageUrl: it.imageUrl,
        price: it.price,
        quantity: Math.max(1, it.quantity),
        position: i,
      })),
    });
    return saved;
  });

  await recordUsageEvent(shop, status === 'active' ? 'bundle_activated' : 'bundle_saved');

  return json({ ok: true, bundleId: bundle.id });
};

export default function BundleBuilder() {
  const { isNew, bundle, starterProducts, plan, upgradeUrl, limitReached } =
    useLoaderData<typeof loader>();
  const embeddedRoute = useEmbeddedRoute();
  const searchAction = useAuthenticatedAction<{ products: CatalogProduct[] }>();
  const saveAction = useAuthenticatedAction<{ ok: boolean; bundleId: string }>();

  const [title, setTitle] = useState(bundle.title);
  const [kind, setKind] = useState<string>(bundle.kind);
  const [discountType, setDiscountType] = useState<DiscountType>(bundle.discountType);
  const [discountValue, setDiscountValue] = useState(String(bundle.discountValue));
  const [minItems, setMinItems] = useState(String(bundle.minItems));
  const [items, setItems] = useState<DraftItem[]>(bundle.items);
  const [query, setQuery] = useState('');

  const saving = saveAction.loading;
  const results = (searchAction.data?.products ?? starterProducts).filter(
    (product): product is CatalogProduct => product !== null,
  );
  const submitSearch = searchAction.submit;

  // Debounced product search.
  useEffect(() => {
    if (!query.trim()) return;

    const handle = setTimeout(() => {
      const fd = new FormData();
      fd.set('intent', 'search');
      fd.set('query', query);
      void submitSearch(
        embeddedRoute(isNew ? '/app/bundles/new' : `/app/bundles/${bundle.id}`),
        'routes/app.bundles.$id',
        fd,
      );
    }, 250);
    return () => clearTimeout(handle);
  }, [bundle.id, embeddedRoute, isNew, query, submitSearch]);

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
        available: p.available,
        availabilityReason: p.availabilityReason,
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
  const unavailableItems = items.filter((item) => !item.available);

  const save = async (activate: boolean) => {
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
    const result = await saveAction.submit(
      embeddedRoute(isNew ? '/app/bundles/new' : `/app/bundles/${bundle.id}`),
      'routes/app.bundles.$id',
      fd,
    );
    if (result?.ok) window.open(embeddedRoute('/app/bundles'), '_self');
  };

  return (
    <Page
      title={isNew ? 'New bundle' : 'Edit bundle'}
      backAction={{ url: embeddedRoute('/app/bundles') }}
      primaryAction={{
        content: 'Save & activate',
        loading: saving,
        disabled: limitReached || items.length < 2 || !title.trim() || unavailableItems.length > 0,
        onAction: () => save(true),
      }}
      secondaryActions={[
        { content: 'Save draft', onAction: () => save(false), disabled: saving || limitReached },
      ]}
    >
      <Layout>
        {isNew && (
          <Layout.Section>
            <div className="KlynaBuilderProgress" aria-label="Bundle setup progress">
              <span className={title.trim() ? 'is-complete' : 'is-current'}>Name the offer</span>
              <span
                className={items.length >= 2 ? 'is-complete' : title.trim() ? 'is-current' : ''}
              >
                Pick two products
              </span>
              <span className={items.length >= 2 ? 'is-current' : ''}>
                Set savings and activate
              </span>
            </div>
          </Layout.Section>
        )}
        {saveAction.error && (
          <Layout.Section>
            <Banner tone="critical" title="Bundle could not be saved">
              {saveAction.error}
            </Banner>
          </Layout.Section>
        )}

        {unavailableItems.length > 0 && (
          <Layout.Section>
            <Banner tone="warning" title="This bundle is not ready for the storefront">
              <Text as="p" variant="bodyMd">
                {unavailableItems
                  .map(
                    (item) =>
                      `${item.title}: ${AVAILABILITY_LABEL[item.availabilityReason].toLowerCase()}`,
                  )
                  .join('. ')}
                . You can save a draft, but activation stays blocked until every item can be bought
                online.
              </Text>
            </Banner>
          </Layout.Section>
        )}

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
                    Pick two products from your catalog below. You can search if you need another.
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
                            {!it.available && (
                              <Badge tone="warning">
                                {AVAILABILITY_LABEL[it.availabilityReason]}
                              </Badge>
                            )}
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
                  loading={searchAction.loading}
                />
                {searchAction.error && <Banner tone="critical">{searchAction.error}</Banner>}
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
                            <BlockStack gap="0">
                              <Text as="span" variant="bodyMd">
                                {p.title}
                              </Text>
                              <Badge tone={p.available ? 'success' : 'warning'}>
                                {AVAILABILITY_LABEL[p.availabilityReason]}
                              </Badge>
                            </BlockStack>
                          </InlineStack>
                          <Button
                            size="slim"
                            disabled={added || !p.available}
                            onClick={() => addItem(p)}
                          >
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
