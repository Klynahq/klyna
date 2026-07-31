import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/node';
import { useLoaderData, useRevalidator } from '@remix-run/react';
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  EmptyState,
  InlineStack,
  Layout,
  Page,
  ResourceItem,
  ResourceList,
  Text,
} from '@shopify/polaris';
import prisma from '../db.server';
import { withAdminSessionRecovery } from '../lib/admin-session-recovery.server';
import { removeAutomaticDiscount, syncAutomaticDiscount } from '../lib/admin.server';
import { useAuthenticatedAction } from '../lib/authenticated-action';
import { useEmbeddedRoute } from '../lib/embedded-routes';
import { getPlanSelectionUrl, getShopPlan } from '../lib/plans.server';
import { type DiscountType, quoteBundle } from '../lib/pricing';
import { authenticate } from '../shopify.server';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const plan = await getShopPlan(session.shop, request);
  const bundles = await prisma.bundle.findMany({
    where: { shop: session.shop },
    orderBy: { updatedAt: 'desc' },
    include: { items: true },
  });

  // Compute each bundle's quoted total so the list shows real savings.
  const rows = bundles.map((b) => {
    const items = b.items.map((it) => ({ price: it.price, quantity: it.quantity }));
    const quote = quoteBundle(items, b.discountType as DiscountType, b.discountValue);
    return {
      id: b.id,
      title: b.title,
      kind: b.kind,
      status: b.status,
      itemCount: b.items.length,
      subtotal: quote.subtotal,
      total: quote.total,
      savingsPercent: quote.savingsPercent,
    };
  });

  return { rows, plan, upgradeUrl: getPlanSelectionUrl(session.shop) };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const form = await request.formData();
  const id = String(form.get('id') ?? '');
  const intent = String(form.get('intent') ?? '');

  const bundle = await prisma.bundle.findFirst({
    where: { id, shop: session.shop },
    include: { items: true },
  });
  if (!bundle) return json({ ok: false, error: 'Bundle not found' }, { status: 404 });

  try {
    if (intent === 'delete') {
      await withAdminSessionRecovery(session, () =>
        removeAutomaticDiscount(admin, bundle.discountGid, `Klyna Bundle · ${bundle.title}`),
      );
      await prisma.bundle.delete({ where: { id } });
      return json({ ok: true });
    }
    if (intent === 'toggle') {
      const next = bundle.status === 'active' ? 'paused' : 'active';
      const discountGid = await withAdminSessionRecovery(session, () =>
        syncAutomaticDiscount(admin, {
          discountGid: bundle.discountGid,
          previousTitle: `Klyna Bundle · ${bundle.title}`,
          active: next === 'active',
          discount: {
            title: `Klyna Bundle · ${bundle.title}`,
            percentage: bundle.discountType === 'percentage' ? bundle.discountValue / 100 : null,
            amount: bundle.discountType === 'fixed_amount' ? bundle.discountValue : null,
            productGids: bundle.items.map((item) => item.productGid),
            minQuantity:
              bundle.kind === 'mix_and_match'
                ? Math.max(1, bundle.minItems)
                : bundle.items.reduce((sum, item) => sum + Math.max(1, item.quantity), 0),
          },
        }),
      );
      await prisma.bundle.update({
        where: { id },
        data: { status: next, discountGid },
      });
      return json({ ok: true });
    }
  } catch (error) {
    if (error instanceof Response) throw error;
    return json(
      {
        ok: false,
        error:
          error instanceof Error
            ? `Shopify discount could not be updated: ${error.message}`
            : 'Shopify discount could not be updated.',
      },
      { status: 502 },
    );
  }
  return json({ ok: false, error: 'Unknown intent' }, { status: 400 });
};

function statusTone(s: string) {
  return s === 'active' ? 'success' : s === 'paused' ? 'attention' : 'new';
}

export default function BundlesIndex() {
  const { rows, plan, upgradeUrl } = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
  const toggleAction = useAuthenticatedAction<{ ok: boolean }>();
  const embeddedRoute = useEmbeddedRoute();
  const atBundleLimit = rows.length >= plan.maxBundles;
  const newBundleAction = atBundleLimit
    ? undefined
    : { content: 'New bundle', url: embeddedRoute('/app/bundles/new') };
  const toggleBundle = async (id: string) => {
    const fd = new FormData();
    fd.set('id', id);
    fd.set('intent', 'toggle');
    const result = await toggleAction.submit(
      embeddedRoute('/app/bundles'),
      'routes/app.bundles._index',
      fd,
    );
    if (result?.ok) revalidator.revalidate();
  };

  if (rows.length === 0) {
    return (
      <Page title="Bundles" primaryAction={newBundleAction}>
        <Layout>
          <Layout.Section>
            <Card>
              <EmptyState
                heading="Build your first bundle"
                action={{ content: 'New bundle', url: embeddedRoute('/app/bundles/new') }}
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>
                  Group products into a fixed set or a mix-and-match offer, apply a discount, and
                  show the savings on the product page with native automatic discounts.
                </p>
              </EmptyState>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  return (
    <Page title="Bundles" primaryAction={newBundleAction}>
      <Layout>
        {toggleAction.error && (
          <Layout.Section>
            <Banner tone="critical" title="Bundle status could not be updated">
              {toggleAction.error}
            </Banner>
          </Layout.Section>
        )}

        {atBundleLimit && (
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
          <Card padding="0">
            <ResourceList
              resourceName={{ singular: 'bundle', plural: 'bundles' }}
              items={rows}
              renderItem={(b) => (
                <ResourceItem
                  id={b.id}
                  url={embeddedRoute(`/app/bundles/${b.id}`)}
                  accessibilityLabel={`Edit ${b.title}`}
                >
                  <InlineStack align="space-between" blockAlign="center" wrap={false}>
                    <BlockStack gap="100">
                      <InlineStack gap="200" blockAlign="center">
                        <Text as="span" variant="bodyMd" fontWeight="semibold">
                          {b.title}
                        </Text>
                        <Badge tone={statusTone(b.status)}>{b.status}</Badge>
                        <Badge>{b.kind === 'fixed' ? 'Fixed set' : 'Mix & match'}</Badge>
                      </InlineStack>
                      <Text as="span" variant="bodySm" tone="subdued">
                        {b.itemCount} {b.itemCount === 1 ? 'product' : 'products'}
                        {b.savingsPercent > 0 ? ` · Save ${b.savingsPercent}%` : ''}
                      </Text>
                    </BlockStack>
                    <Box>
                      <InlineStack gap="200" blockAlign="center">
                        <Text as="span" variant="bodyMd" tone="subdued">
                          <s>{b.subtotal.toFixed(2)}</s>
                        </Text>
                        <Text as="span" variant="bodyMd" fontWeight="semibold">
                          {b.total.toFixed(2)}
                        </Text>
                        <span
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                          }}
                          onKeyDown={(event) => event.stopPropagation()}
                        >
                          <Button
                            size="slim"
                            variant="tertiary"
                            loading={toggleAction.loading}
                            onClick={() => void toggleBundle(b.id)}
                          >
                            {b.status === 'active' ? 'Pause' : 'Activate'}
                          </Button>
                        </span>
                      </InlineStack>
                    </Box>
                  </InlineStack>
                </ResourceItem>
              )}
            />
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
