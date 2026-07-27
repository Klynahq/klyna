import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/node';
import { Link, useFetcher, useLoaderData } from '@remix-run/react';
import {
  Badge,
  Box,
  Button,
  Card,
  EmptyState,
  IndexTable,
  InlineStack,
  Layout,
  Page,
  Text,
} from '@shopify/polaris';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';
import { useEmbeddedRoute } from '../lib/embedded-routes';

const TRIGGER_LABEL: Record<string, string> = {
  product: 'Product in cart',
  collection: 'Collection in cart',
  cart_value: 'Cart value',
};

const PLACEMENT_LABEL: Record<string, string> = {
  cart: 'Cart drawer',
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const offers = await prisma.offer.findMany({
    where: { shop: session.shop },
    include: { variants: { orderBy: { label: 'asc' } } },
    orderBy: { createdAt: 'desc' },
  });
  return { offers };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get('intent') ?? '');
  const id = String(form.get('id') ?? '');

  // Guard: only ever touch rows owned by this shop.
  const offer = await prisma.offer.findFirst({ where: { id, shop: session.shop } });
  if (!offer) {
    return json({ error: 'Offer not found' }, { status: 404 });
  }

  if (intent === 'toggle') {
    await prisma.offer.update({ where: { id }, data: { enabled: !offer.enabled } });
    return json({ ok: true });
  }
  if (intent === 'delete') {
    await prisma.offer.delete({ where: { id } });
    return json({ ok: true });
  }
  return json({ error: 'Unknown intent' }, { status: 400 });
};

export default function OffersIndex() {
  const embeddedRoute = useEmbeddedRoute();
  const { offers } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();

  const resourceName = { singular: 'offer', plural: 'offers' };

  if (offers.length === 0) {
    return (
      <Page
        title="Offers"
        backAction={{ url: embeddedRoute('/app') }}
        primaryAction={{ content: 'Create offer', url: embeddedRoute('/app/offers/new') }}
      >
        <Layout>
          <Layout.Section>
            <Card>
              <EmptyState
                heading="Create your first upsell offer"
                action={{ content: 'Create offer', url: embeddedRoute('/app/offers/new') }}
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>
                  Offers decide which product to recommend, when to show it, and
                  whether to A/B test two recommendations against each other.
                </p>
              </EmptyState>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  const rows = offers.map((offer, index) => {
    const variantSummary =
      offer.variants.length > 1
        ? `A/B · ${offer.variants.map((v) => v.productTitle).join(' vs ')}`
        : (offer.variants[0]?.productTitle ?? '—');

    return (
      <IndexTable.Row id={offer.id} key={offer.id} position={index}>
        <IndexTable.Cell>
          <Link to={embeddedRoute(`/app/offers/${offer.id}`)}>
            <Text as="span" fontWeight="semibold">{offer.name}</Text>
          </Link>
        </IndexTable.Cell>
        <IndexTable.Cell>{TRIGGER_LABEL[offer.triggerType] ?? offer.triggerType}</IndexTable.Cell>
        <IndexTable.Cell>{PLACEMENT_LABEL[offer.placement] ?? offer.placement}</IndexTable.Cell>
        <IndexTable.Cell>
          <Text as="span" tone="subdued">{variantSummary}</Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Badge tone={offer.enabled ? 'success' : undefined}>
            {offer.enabled ? 'Live' : 'Paused'}
          </Badge>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <InlineStack gap="200">
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="toggle" />
              <input type="hidden" name="id" value={offer.id} />
              <Button submit variant="tertiary" size="slim">
                {offer.enabled ? 'Pause' : 'Resume'}
              </Button>
            </fetcher.Form>
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="delete" />
              <input type="hidden" name="id" value={offer.id} />
              <Button submit variant="tertiary" tone="critical" size="slim">
                Delete
              </Button>
            </fetcher.Form>
          </InlineStack>
        </IndexTable.Cell>
      </IndexTable.Row>
    );
  });

  return (
    <Page
      title="Offers"
      backAction={{ url: embeddedRoute('/app') }}
      primaryAction={{ content: 'Create offer', url: embeddedRoute('/app/offers/new') }}
    >
      <Layout>
        <Layout.Section>
          <Card padding="0">
            <IndexTable
              resourceName={resourceName}
              itemCount={offers.length}
              selectable={false}
              headings={[
                { title: 'Name' },
                { title: 'Trigger' },
                { title: 'Placement' },
                { title: 'Recommends' },
                { title: 'Status' },
                { title: 'Actions' },
              ]}
            >
              {rows}
            </IndexTable>
          </Card>
        </Layout.Section>
        <Layout.Section>
          <Box paddingBlockStart="200">
            <Text as="p" variant="bodySm" tone="subdued">
              Tip: an offer with both an A and a B variant runs a split test
              automatically using the split you set on the offer.
            </Text>
          </Box>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
