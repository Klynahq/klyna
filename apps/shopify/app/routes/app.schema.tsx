import { schema } from '@klyna/core';
import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/node';
import { Form, useActionData, useLoaderData, useNavigation } from '@remix-run/react';
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  Divider,
  InlineGrid,
  InlineStack,
  Layout,
  Page,
  Text,
} from '@shopify/polaris';
import prisma from '../db.server';
import { authenticate } from '../shopify.server';

type SchemaConfigView = {
  orgEnabled: boolean;
  productEnabled: boolean;
  breadcrumbEnabled: boolean;
  faqEnabled: boolean;
};

type ProductNode = {
  title: string;
  handle: string;
  descriptionHtml: string;
  onlineStoreUrl: string | null;
  featuredMedia: { preview: { image: { url: string } | null } | null } | null;
  priceRangeV2: { minVariantPrice: { amount: string; currencyCode: string } };
};

type ShopData = {
  data: {
    shop: { name: string; description: string | null; primaryDomain: { url: string } };
    products: { nodes: ProductNode[] };
  };
};

const DEFAULT_CONFIG: SchemaConfigView = {
  orgEnabled: false,
  productEnabled: false,
  breadcrumbEnabled: false,
  faqEnabled: false,
};

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function jsonLdScript(input: Record<string, unknown> | Record<string, unknown>[]): string {
  return `<script type="application/ld+json">\n${JSON.stringify(input, null, 2)}\n</script>`;
}

function SnippetCard({
  title,
  enabled,
  children,
}: {
  title: string;
  enabled: boolean;
  children: string;
}) {
  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="center">
          <Text as="h3" variant="headingMd">
            {title}
          </Text>
          <Badge tone={enabled ? 'success' : 'warning'}>{enabled ? 'Configured' : 'Off'}</Badge>
        </InlineStack>
        <Box
          background="bg-surface-secondary"
          padding="300"
          borderRadius="200"
          borderWidth="025"
          borderColor="border"
        >
          <pre
            style={{
              margin: 0,
              fontSize: 12,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              maxHeight: 320,
              overflowY: 'auto',
            }}
          >
            {children}
          </pre>
        </Box>
      </BlockStack>
    </Card>
  );
}

function ToggleRow({
  name,
  label,
  detail,
  checked,
}: {
  name: keyof SchemaConfigView;
  label: string;
  detail: string;
  checked: boolean;
}) {
  return (
    <label style={{ display: 'block', cursor: 'pointer' }}>
      <InlineStack gap="300" blockAlign="start" wrap={false}>
        <input
          type="checkbox"
          name={name}
          defaultChecked={checked}
          style={{ width: 18, height: 18, marginTop: 2, accentColor: '#7c5cff' }}
        />
        <BlockStack gap="050">
          <Text as="span" variant="bodyMd" fontWeight="semibold">
            {label}
          </Text>
          <Text as="span" variant="bodySm" tone="subdued">
            {detail}
          </Text>
        </BlockStack>
      </InlineStack>
    </label>
  );
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;

  const [config, shopRes] = await Promise.all([
    prisma.schemaConfig.findUnique({ where: { shop } }),
    admin.graphql(`{
      shop { name description primaryDomain { url } }
      products(first: 1) {
        nodes {
          title handle descriptionHtml onlineStoreUrl
          featuredMedia { preview { image { url } } }
          priceRangeV2 { minVariantPrice { amount currencyCode } }
        }
      }
    }`),
  ]);

  const data = ((await shopRes.json()) as ShopData).data;
  const storeUrl = data.shop.primaryDomain.url.replace(/\/$/, '');
  const firstProduct = data.products.nodes[0] ?? null;

  const organization = schema.buildOrganization({
    name: data.shop.name,
    url: storeUrl,
    description: data.shop.description ?? undefined,
  });
  const website = schema.buildWebSite({
    name: data.shop.name,
    url: storeUrl,
    publisherId: `${storeUrl}#organization`,
  });

  const product = firstProduct
    ? schema.buildProduct({
        name: firstProduct.title,
        description: stripHtml(firstProduct.descriptionHtml) || firstProduct.title,
        image: firstProduct.featuredMedia?.preview?.image?.url,
        url: firstProduct.onlineStoreUrl ?? `${storeUrl}/products/${firstProduct.handle}`,
        price: Number(firstProduct.priceRangeV2.minVariantPrice.amount),
        priceCurrency: firstProduct.priceRangeV2.minVariantPrice.currencyCode,
        availability: 'InStock',
        brand: data.shop.name,
      })
    : null;

  const breadcrumb = schema.buildBreadcrumbList([
    { name: 'Home', url: storeUrl },
    { name: 'Products', url: `${storeUrl}/collections/all` },
    ...(firstProduct
      ? [
          {
            name: firstProduct.title,
            url: firstProduct.onlineStoreUrl ?? `${storeUrl}/products/${firstProduct.handle}`,
          },
        ]
      : []),
  ]);

  const faq = schema.buildFAQPage([
    {
      question: `What does ${data.shop.name} sell?`,
      answer:
        data.shop.description ?? `${data.shop.name} sells products through its Shopify storefront.`,
    },
    {
      question: `Where can I buy from ${data.shop.name}?`,
      answer: `You can shop directly at ${storeUrl}.`,
    },
  ]);

  return json({
    config: config ?? DEFAULT_CONFIG,
    shopName: data.shop.name,
    storeUrl,
    hasProductPreview: !!firstProduct,
    snippets: {
      organization: jsonLdScript([organization, website]),
      product: product ? jsonLdScript(product) : 'Add a product to preview Product schema.',
      breadcrumb: jsonLdScript(breadcrumb),
      faq: jsonLdScript(faq),
    },
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const data: SchemaConfigView = {
    orgEnabled: form.get('orgEnabled') === 'on',
    productEnabled: form.get('productEnabled') === 'on',
    breadcrumbEnabled: form.get('breadcrumbEnabled') === 'on',
    faqEnabled: form.get('faqEnabled') === 'on',
  };

  await prisma.schemaConfig.upsert({
    where: { shop: session.shop },
    create: { shop: session.shop, ...data },
    update: data,
  });

  return json({ saved: true });
};

export default function SchemaPage() {
  const { config, shopName, storeUrl, hasProductPreview, snippets } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const saving = navigation.state === 'submitting';
  const enabledCount = [
    config.orgEnabled,
    config.productEnabled,
    config.breadcrumbEnabled,
    config.faqEnabled,
  ].filter(Boolean).length;

  return (
    <Page title="Schema markup" subtitle={`${shopName} · ${storeUrl}`} backAction={{ url: '/app' }}>
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingMd">
                    JSON-LD schema kit
                  </Text>
                  <Text as="p" tone="subdued">
                    Configure the schema types you want Klyna to generate, then add the snippets to
                    your theme before the closing head tag or inside a custom-liquid block.
                  </Text>
                </BlockStack>
                <Badge
                  tone={enabledCount > 0 ? 'success' : 'warning'}
                >{`${enabledCount} enabled`}</Badge>
              </InlineStack>

              <Form method="post">
                <BlockStack gap="300">
                  <InlineGrid columns={{ xs: 1, md: 2 }} gap="300">
                    <ToggleRow
                      name="orgEnabled"
                      label="Organization + WebSite"
                      detail="Brand entity, site name, URL, and publisher relationship."
                      checked={config.orgEnabled}
                    />
                    <ToggleRow
                      name="productEnabled"
                      label="Product"
                      detail="Product name, description, image, price, currency, and availability."
                      checked={config.productEnabled}
                    />
                    <ToggleRow
                      name="breadcrumbEnabled"
                      label="BreadcrumbList"
                      detail="Clear hierarchy from homepage to collection to product pages."
                      checked={config.breadcrumbEnabled}
                    />
                    <ToggleRow
                      name="faqEnabled"
                      label="FAQPage"
                      detail="Question and answer markup for support, policy, and product pages."
                      checked={config.faqEnabled}
                    />
                  </InlineGrid>
                  <InlineStack gap="200" blockAlign="center">
                    <Button submit variant="primary" loading={saving}>
                      Save schema settings
                    </Button>
                    {actionData?.saved && <Badge tone="success">Saved</Badge>}
                  </InlineStack>
                </BlockStack>
              </Form>
            </BlockStack>
          </Card>
        </Layout.Section>

        {!hasProductPreview && (
          <Layout.Section>
            <Banner tone="warning" title="Product schema preview needs a product">
              <Text as="p" variant="bodyMd">
                Add at least one Shopify product to preview Product JSON-LD. Organization,
                BreadcrumbList, and FAQ snippets are still available.
              </Text>
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              Generated snippets
            </Text>
            <InlineGrid columns={{ xs: 1, md: 2 }} gap="300">
              <SnippetCard title="Organization + WebSite" enabled={config.orgEnabled}>
                {snippets.organization}
              </SnippetCard>
              <SnippetCard title="Product" enabled={config.productEnabled}>
                {snippets.product}
              </SnippetCard>
              <SnippetCard title="BreadcrumbList" enabled={config.breadcrumbEnabled}>
                {snippets.breadcrumb}
              </SnippetCard>
              <SnippetCard title="FAQPage" enabled={config.faqEnabled}>
                {snippets.faq}
              </SnippetCard>
            </InlineGrid>
          </BlockStack>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Theme placement
              </Text>
              <Divider />
              <BlockStack gap="200">
                <Text as="p" variant="bodyMd">
                  Sitewide snippets belong in <code>layout/theme.liquid</code> before{' '}
                  <code>{'</head>'}</code>. Product snippets belong on product templates or product
                  custom-liquid blocks.
                </Text>
                <Text as="p" tone="subdued">
                  Klyna stores these settings and generates the markup immediately from live shop
                  data. Place the snippets through Shopify&apos;s theme editor or custom-liquid
                  blocks on the matching templates.
                </Text>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
