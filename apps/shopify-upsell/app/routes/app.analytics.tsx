import { type LoaderFunctionArgs } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import {
  Badge,
  BlockStack,
  Box,
  Card,
  DataTable,
  EmptyState,
  InlineGrid,
  Layout,
  Page,
  Text,
} from '@shopify/polaris';
import { authenticate } from '../shopify.server';
import { getShopStats, type OfferStats } from '../models/offers.server';
import { formatMoney } from '../lib/format';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const { totals, offers } = await getShopStats(session.shop);
  return { totals, offers };
};

// Declare an A/B winner once both variants have a meaningful sample. Returns the
// winning label, or null while results are still too thin to call.
function abWinner(offer: OfferStats): { label: string; lift: number } | null {
  if (offer.variants.length < 2) return null;
  const a = offer.variants.find((v) => v.label === 'A');
  const b = offer.variants.find((v) => v.label === 'B');
  if (!a || !b) return null;
  if (a.impressions < 50 || b.impressions < 50) return null;
  if (a.conversionRate === b.conversionRate) return null;
  const [win, lose] = a.conversionRate > b.conversionRate ? [a, b] : [b, a];
  const lift = lose.conversionRate === 0 ? 1 : win.conversionRate / lose.conversionRate - 1;
  return { label: win.label, lift };
}

export default function Analytics() {
  const { totals, offers } = useLoaderData<typeof loader>();

  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

  const summary = [
    { label: 'Impressions', value: totals.impressions.toLocaleString() },
    { label: 'Accepts', value: totals.accepts.toLocaleString() },
    { label: 'Accept rate', value: pct(totals.conversionRate) },
    { label: 'Confirmed conversions', value: totals.conversions.toLocaleString() },
    { label: 'Attributed revenue', value: formatMoney(totals.revenue) },
  ];

  if (offers.length === 0) {
    return (
      <Page title="Analytics" backAction={{ url: '/app' }}>
        <Layout>
          <Layout.Section>
            <Card>
              <EmptyState
                heading="No data yet"
                action={{ content: 'Create an offer', url: '/app/offers/new' }}
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>
                  Once an offer goes live and shoppers start seeing it, impressions,
                  accept rate, and attributed revenue land here — broken out per
                  offer and per A/B variant.
                </p>
              </EmptyState>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  return (
    <Page title="Analytics" backAction={{ url: '/app' }} subtitle="Conversion and revenue per offer">
      <Layout>
        <Layout.Section>
          <InlineGrid columns={{ xs: 1, sm: 2, md: 5 }} gap="300">
            {summary.map((s) => (
              <Card key={s.label}>
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">{s.label}</Text>
                  <Text as="p" variant="headingLg" fontWeight="bold">{s.value}</Text>
                </BlockStack>
              </Card>
            ))}
          </InlineGrid>
        </Layout.Section>

        {offers.map((offer) => {
          const winner = abWinner(offer);
          return (
            <Layout.Section key={offer.offerId}>
              <Card>
                <BlockStack gap="300">
                  <Box>
                    <BlockStack gap="100">
                      <Text as="h2" variant="headingMd">{offer.name}</Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        {offer.placement === 'cart' ? 'Cart drawer' : 'Post-purchase'} ·{' '}
                        {offer.impressions.toLocaleString()} impressions ·{' '}
                        {formatMoney(offer.revenue)} attributed
                        {!offer.enabled && ' · paused'}
                      </Text>
                    </BlockStack>
                  </Box>

                  {winner && (
                    <Box>
                      <Badge tone="success">
                        {`Variant ${winner.label} winning · +${(winner.lift * 100).toFixed(0)}% accept rate`}
                      </Badge>
                    </Box>
                  )}

                  <DataTable
                    columnContentTypes={['text', 'text', 'numeric', 'numeric', 'numeric', 'numeric', 'numeric']}
                    headings={['Variant', 'Recommends', 'Impressions', 'Accepts', 'Accept rate', 'Conversions', 'Revenue']}
                    rows={offer.variants.map((v) => [
                      `Variant ${v.label}`,
                      v.productTitle,
                      v.impressions.toLocaleString(),
                      v.accepts.toLocaleString(),
                      pct(v.conversionRate),
                      v.conversions.toLocaleString(),
                      formatMoney(v.revenue),
                    ])}
                  />
                </BlockStack>
              </Card>
            </Layout.Section>
          );
        })}
      </Layout>
    </Page>
  );
}
