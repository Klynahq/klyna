import { type LoaderFunctionArgs } from '@remix-run/node';
import { Link, useLoaderData } from '@remix-run/react';
import {
  Badge,
  BlockStack,
  Card,
  InlineGrid,
  InlineStack,
  Layout,
  Page,
  Text,
} from '@shopify/polaris';
import { authenticate } from '../shopify.server';
import { getShopAiSettings } from '../lib/ai.server';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const ai = await getShopAiSettings(session.shop);
  return {
    shop: session.shop,
    aiEnabled: ai.provider !== 'off' && !!ai.apiKey,
    aiProvider: ai.provider,
  };
};

export default function Dashboard() {
  const { shop, aiEnabled, aiProvider } = useLoaderData<typeof loader>();

  const tiles = [
    {
      title: 'Audit store',
      body: 'Run a full SEO + GEO audit and one-click fix the basics (title, description, OG, schema). AI suggestions for the rest.',
      to: '/app/audit',
      cta: 'Run audit',
    },
    {
      title: 'Schema markup',
      body: 'Inject Organization, BreadcrumbList, FAQPage, and Product schema across your store.',
      to: '/app/schema',
      cta: 'Configure',
    },
    {
      title: 'Internal links',
      body: 'Find missing internal links between products, collections, and pages using TF-IDF similarity.',
      to: '/app/links',
      cta: 'Open',
    },
    {
      title: 'Settings',
      body: 'Connect a free AI provider (OpenRouter / Groq / Gemini) for content generation. BYOK — keys stay on your DB.',
      to: '/app/settings',
      cta: aiEnabled ? `Connected · ${aiProvider}` : 'Set up',
    },
  ];

  return (
    <Page title="Klyna SEO" subtitle={`Connected to ${shop}`}>
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <InlineStack gap="200" blockAlign="center">
                <Text as="h2" variant="headingMd">Organic growth, on autopilot.</Text>
                {aiEnabled ? (
                  <Badge tone="success">{`AI · ${aiProvider}`}</Badge>
                ) : (
                  <Badge tone="info">No AI key set</Badge>
                )}
              </InlineStack>
              <Text as="p" variant="bodyMd" tone="subdued">
                Klyna runs entirely on free infrastructure — no per-month pricing, no data leaves
                your store, and AI is optional + bring-your-own-key. Pick a module to get started.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
        <Layout.Section>
          <InlineGrid columns={{ xs: 1, md: 2 }} gap="300">
            {tiles.map((t) => (
              <Card key={t.to}>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingSm">{t.title}</Text>
                  <Text as="p" variant="bodyMd" tone="subdued">{t.body}</Text>
                  <Link to={t.to}>{t.cta} →</Link>
                </BlockStack>
              </Card>
            ))}
          </InlineGrid>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
