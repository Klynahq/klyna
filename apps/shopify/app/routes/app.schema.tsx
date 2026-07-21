import { schema } from '@klyna/core';
import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/node';
import { useActionData, useFetcher, useLoaderData } from '@remix-run/react';
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  Checkbox,
  Divider,
  InlineStack,
  Layout,
  Page,
  Text,
  TextField,
} from '@shopify/polaris';
import { useState } from 'react';
import prisma from '../db.server';
import { authenticate } from '../shopify.server';

type ShopGqlData = {
  data: {
    shop: {
      id: string;
      name: string;
      email: string;
      myshopifyDomain: string;
      url: string;
      primaryDomain: { url: string };
      description: string | null;
    };
  };
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;

  const res = await admin.graphql(`{
    shop {
      id
      name
      email
      myshopifyDomain
      url
      primaryDomain { url }
      description
    }
  }`);
  const {
    data: { shop: shopData },
  } = (await res.json()) as ShopGqlData;

  const config = await prisma.schemaConfig.findUnique({ where: { shop } });
  const storeUrl = shopData.primaryDomain.url.replace(/\/$/, '');

  // Build previews
  const orgSchema = schema.buildOrganization({
    name: shopData.name,
    url: storeUrl,
    description: shopData.description ?? undefined,
  });

  const websiteSchema = schema.buildWebSite({
    name: shopData.name,
    url: storeUrl,
    publisherId: `${storeUrl}#organization`,
  });

  return json({
    shop,
    shopName: shopData.name,
    shopId: shopData.id,
    storeUrl,
    config: {
      orgEnabled: config?.orgEnabled ?? false,
      productEnabled: config?.productEnabled ?? false,
      breadcrumbEnabled: config?.breadcrumbEnabled ?? false,
      faqEnabled: config?.faqEnabled ?? false,
    },
    orgSchemaPreview: JSON.stringify(orgSchema, null, 2),
    websiteSchemaPreview: JSON.stringify(websiteSchema, null, 2),
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();
  const intent = String(form.get('intent') ?? 'save');

  if (intent === 'save') {
    const orgEnabled = form.get('orgEnabled') === 'true';
    const productEnabled = form.get('productEnabled') === 'true';
    const breadcrumbEnabled = form.get('breadcrumbEnabled') === 'true';
    const faqEnabled = form.get('faqEnabled') === 'true';

    await prisma.schemaConfig.upsert({
      where: { shop },
      update: { orgEnabled, productEnabled, breadcrumbEnabled, faqEnabled },
      create: { shop, orgEnabled, productEnabled, breadcrumbEnabled, faqEnabled },
    });

    if (orgEnabled) {
      // Get shop info to build schema
      type ShopRes = {
        data: {
          shop: {
            id: string;
            name: string;
            url: string;
            primaryDomain: { url: string };
            description: string | null;
          };
        };
      };
      const shopRes = await admin.graphql(
        '{ shop { id name url primaryDomain { url } description } }',
      );
      const {
        data: { shop: sd },
      } = (await shopRes.json()) as ShopRes;
      const storeUrl = sd.primaryDomain.url.replace(/\/$/, '');

      const orgJson = JSON.stringify(
        schema.buildOrganization({
          name: sd.name,
          url: storeUrl,
          description: sd.description ?? undefined,
        }),
      );

      const websiteJson = JSON.stringify(
        schema.buildWebSite({
          name: sd.name,
          url: storeUrl,
          publisherId: `${storeUrl}#organization`,
        }),
      );

      // Write combined schema to shop metafield
      const combined = JSON.stringify({
        '@context': 'https://schema.org',
        '@graph': [
          schema.buildOrganization({
            name: sd.name,
            url: storeUrl,
            description: sd.description ?? undefined,
          }),
          schema.buildWebSite({
            name: sd.name,
            url: storeUrl,
            publisherId: `${storeUrl}#organization`,
          }),
        ],
      });

      await admin.graphql(
        `
        mutation klynaSetGlobalSchema($ownerId: ID!, $value: String!) {
          metafieldsSet(metafields: [{
            ownerId: $ownerId
            namespace: "klyna"
            key: "global_schema"
            type: "json"
            value: $value
          }]) { userErrors { field message } }
        }
      `,
        { variables: { ownerId: sd.id, value: combined } },
      );

      void orgJson;
      void websiteJson; // generated, used in combined
    }

    return json({ saved: true, orgEnabled, productEnabled, breadcrumbEnabled, faqEnabled });
  }

  return json({ saved: false });
};

const LIQUID_SNIPPET = `{%- comment -%} Klyna SEO — global schema. Paste inside <head> in layout/theme.liquid {%- endcomment -%}
{% if shop.metafields.klyna.global_schema %}
<script type="application/ld+json">
  {{ shop.metafields.klyna.global_schema.value }}
</script>
{% endif %}`;

const PRODUCT_SNIPPET = `{%- comment -%} Klyna SEO — product schema. Paste in sections/main-product.liquid {%- endcomment -%}
{% if product.metafields.klyna.product_schema %}
<script type="application/ld+json">
  {{ product.metafields.klyna.product_schema.value }}
</script>
{% endif %}`;

export default function SchemaPage() {
  const { shopName, storeUrl, config, orgSchemaPreview, websiteSchemaPreview } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const fetcher = useFetcher();

  const [orgEnabled, setOrgEnabled] = useState(config.orgEnabled);
  const [productEnabled, setProductEnabled] = useState(config.productEnabled);
  const [breadcrumbEnabled, setBreadcrumbEnabled] = useState(config.breadcrumbEnabled);
  const [faqEnabled, setFaqEnabled] = useState(config.faqEnabled);
  const [copied, setCopied] = useState<string | null>(null);

  const saving = fetcher.state === 'submitting';
  const saved = actionData && 'saved' in actionData ? actionData.saved : false;

  const copyToClipboard = (text: string, key: string) => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  const save = () => {
    const fd = new FormData();
    fd.set('intent', 'save');
    fd.set('orgEnabled', String(orgEnabled));
    fd.set('productEnabled', String(productEnabled));
    fd.set('breadcrumbEnabled', String(breadcrumbEnabled));
    fd.set('faqEnabled', String(faqEnabled));
    fetcher.submit(fd, { method: 'post' });
  };

  return (
    <Page title="Schema Markup" backAction={{ url: '/app' }}>
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <BlockStack gap="100">
                <Text as="h2" variant="headingMd">
                  Structured data for {shopName}
                </Text>
                <Text as="p" tone="subdued">
                  Schema markup tells Google exactly what your store, products, and content are.
                  Enable the types below — Klyna writes the JSON-LD to your store&apos;s metafields.
                  Then paste the one-time Liquid snippet into your theme to inject it.
                </Text>
              </BlockStack>

              <Divider />

              <BlockStack gap="300">
                <Checkbox
                  label={
                    <InlineStack gap="200" blockAlign="center">
                      <Text as="span" variant="bodyMd" fontWeight="semibold">
                        Organization + WebSite
                      </Text>
                      <Badge tone="success">Recommended</Badge>
                    </InlineStack>
                  }
                  helpText="Tells Google who you are. Required for brand SERP features, sitelinks, and knowledge panel."
                  checked={orgEnabled}
                  onChange={setOrgEnabled}
                />
                <Checkbox
                  label={
                    <InlineStack gap="200" blockAlign="center">
                      <Text as="span" variant="bodyMd" fontWeight="semibold">
                        Product schema
                      </Text>
                      <Badge>Price · Availability · Images</Badge>
                    </InlineStack>
                  }
                  helpText="Enriches product listings in Google Shopping and SERPs with price and stock status."
                  checked={productEnabled}
                  onChange={setProductEnabled}
                />
                <Checkbox
                  label={
                    <Text as="span" variant="bodyMd" fontWeight="semibold">
                      BreadcrumbList
                    </Text>
                  }
                  helpText="Shows collection › product breadcrumbs in search results."
                  checked={breadcrumbEnabled}
                  onChange={setBreadcrumbEnabled}
                />
                <Checkbox
                  label={
                    <Text as="span" variant="bodyMd" fontWeight="semibold">
                      FAQPage
                    </Text>
                  }
                  helpText="Detect FAQ sections in your pages and blog posts and emit FAQPage schema."
                  checked={faqEnabled}
                  onChange={setFaqEnabled}
                />
              </BlockStack>

              <InlineStack gap="200">
                <Button variant="primary" onClick={save} loading={saving}>
                  Save &amp; write to metafields
                </Button>
              </InlineStack>

              {saved && (
                <Banner tone="success" title="Schema written to metafields">
                  <Text as="p" variant="bodyMd">
                    Your schema is live in Shopify metafields. Paste the Liquid snippet below once
                    to make Google see it on every page.
                  </Text>
                </Banner>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* One-time theme installation */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <BlockStack gap="100">
                <InlineStack gap="200" blockAlign="center">
                  <Text as="h2" variant="headingMd">
                    One-time theme installation
                  </Text>
                  <Badge tone="info">Required once</Badge>
                </InlineStack>
                <Text as="p" tone="subdued">
                  Copy the snippet below and paste it inside the{' '}
                  <Text as="span" variant="bodyMd" fontWeight="semibold">
                    &lt;head&gt;
                  </Text>{' '}
                  tag in your theme&apos;s{' '}
                  <Text as="span" variant="bodyMd" fontWeight="semibold">
                    layout/theme.liquid
                  </Text>
                  . This wires up all schema types you enable above — forever, with no further theme
                  edits needed.
                </Text>
              </BlockStack>

              <BlockStack gap="200">
                <Text as="h3" variant="headingSm">
                  Global schema (Organization + WebSite)
                </Text>
                <Box
                  background="bg-surface-secondary"
                  padding="300"
                  borderRadius="200"
                  borderWidth="025"
                  borderColor="border"
                >
                  <Text as="p" variant="bodyMd">
                    <pre
                      style={{
                        margin: 0,
                        fontSize: '12px',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-all',
                        fontFamily: 'monospace',
                      }}
                    >
                      {LIQUID_SNIPPET}
                    </pre>
                  </Text>
                </Box>
                <Button
                  onClick={() => copyToClipboard(LIQUID_SNIPPET, 'global')}
                  size="slim"
                  variant="secondary"
                >
                  {copied === 'global' ? '✓ Copied!' : 'Copy snippet'}
                </Button>
              </BlockStack>

              {productEnabled && (
                <BlockStack gap="200">
                  <Text as="h3" variant="headingSm">
                    Product schema
                  </Text>
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
                        fontSize: '12px',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-all',
                        fontFamily: 'monospace',
                      }}
                    >
                      {PRODUCT_SNIPPET}
                    </pre>
                  </Box>
                  <Button
                    onClick={() => copyToClipboard(PRODUCT_SNIPPET, 'product')}
                    size="slim"
                    variant="secondary"
                  >
                    {copied === 'product' ? '✓ Copied!' : 'Copy snippet'}
                  </Button>
                </BlockStack>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Live previews */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Generated JSON-LD preview
              </Text>
              <Text as="p" tone="subdued">
                Exactly what gets written to your metafield and emitted by the snippet above.
                Validate at{' '}
                <a href="https://validator.schema.org" target="_blank" rel="noopener noreferrer">
                  validator.schema.org
                </a>
                .
              </Text>

              <BlockStack gap="200">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h3" variant="headingSm">
                    Organization
                  </Text>
                  <Badge tone={orgEnabled ? 'success' : 'critical'}>
                    {orgEnabled ? 'Enabled' : 'Disabled'}
                  </Badge>
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
                      fontSize: '12px',
                      overflowX: 'auto',
                      fontFamily: 'monospace',
                    }}
                  >
                    {orgSchemaPreview}
                  </pre>
                </Box>
              </BlockStack>

              <BlockStack gap="200">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h3" variant="headingSm">
                    WebSite
                  </Text>
                  <Badge tone={orgEnabled ? 'success' : 'critical'}>
                    {orgEnabled ? 'Enabled' : 'Disabled'}
                  </Badge>
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
                      fontSize: '12px',
                      overflowX: 'auto',
                      fontFamily: 'monospace',
                    }}
                  >
                    {websiteSchemaPreview}
                  </pre>
                </Box>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Rich results eligibility */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Rich results eligibility
              </Text>
              <BlockStack gap="200">
                {[
                  {
                    type: 'Sitelinks searchbox',
                    eligible: orgEnabled,
                    requirement: 'Organization + WebSite schema',
                  },
                  {
                    type: 'Product rich results (price, availability)',
                    eligible: productEnabled,
                    requirement: 'Product schema with Offer',
                  },
                  {
                    type: 'Breadcrumb trail in SERPs',
                    eligible: breadcrumbEnabled,
                    requirement: 'BreadcrumbList schema',
                  },
                  {
                    type: 'FAQ expandable results',
                    eligible: faqEnabled,
                    requirement: 'FAQPage schema on relevant pages',
                  },
                ].map((item) => (
                  <InlineStack key={item.type} align="space-between" blockAlign="center">
                    <BlockStack gap="050">
                      <Text as="p" variant="bodyMd">
                        {item.type}
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Requires: {item.requirement}
                      </Text>
                    </BlockStack>
                    <Badge tone={item.eligible ? 'success' : 'warning'}>
                      {item.eligible ? '✓ Eligible' : 'Not enabled'}
                    </Badge>
                  </InlineStack>
                ))}
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
