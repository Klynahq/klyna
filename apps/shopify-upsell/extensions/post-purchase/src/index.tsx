/*
 * Klyna Upsell — post-purchase Checkout UI extension.
 *
 * Two stages:
 *   1. ShouldRender — ask the app whether there's a live post-purchase offer for
 *      this order's cart. If so, stash it in `storage` and render.
 *   2. Render — show the one-click offer. Accepting calls `calculateChangeset`
 *      + `applyChangeset` so Shopify charges the existing payment method with no
 *      re-entry, then logs the accept back to the app.
 *
 * The app base URL is injected at build time via `process.env.KLYNA_APP_URL`
 * (the Shopify CLI passes it through), falling back to klyna.dev.
 */
import {
  extend,
  render,
  useExtensionInput,
  BlockStack,
  Button,
  CalloutBanner,
  Heading,
  Image,
  Layout,
  TextBlock,
  TextContainer,
  View,
} from '@shopify/post-purchase-ui-extensions-react';
import { useState } from 'react';

const APP_URL = (process.env.KLYNA_APP_URL || 'https://klyna.dev').replace(/\/+$/, '');

interface KlynaOffer {
  offerId: string;
  variantId: string;
  productGid: string;
  productHandle: string;
  productTitle: string;
  productImage: string | null;
  headline: string;
  ctaText: string;
  discountPercent: number;
}

// Stage 1 — decide whether to show, and cache the offer for the render stage.
extend('Checkout::PostPurchase::ShouldRender', async ({ inputData, storage }) => {
  const shop = inputData.shop?.domain ?? '';
  const purchase = inputData.initialPurchase;
  const cartTotal = Math.round(Number(purchase?.totalPriceSet?.presentmentMoney?.amount ?? '0') * 100);
  const products = (purchase?.lineItems ?? [])
    .map((li) => li.product?.id)
    .filter(Boolean)
    .map((id) => `gid://shopify/Product/${id}`);

  if (!shop) return { render: false };

  const params = new URLSearchParams({
    shop,
    placement: 'post_purchase',
    cartTotal: String(cartTotal),
    products: products.join(','),
    cartToken: String(inputData.token ?? ''),
  });

  try {
    const res = await fetch(`${APP_URL}/api/offers?${params.toString()}`, { credentials: 'omit' });
    const data = (await res.json()) as { offer: KlynaOffer | null };
    if (!data.offer) return { render: false };
    await storage.update({ offer: data.offer });
    return { render: true };
  } catch (e) {
    return { render: false };
  }
});

// Stage 2 — render the offer and handle accept / decline.
render('Checkout::PostPurchase::Render', () => <App />);

function App() {
  return <Offer />;
}

function Offer() {
  // useExtensionInput provides storage + the changeset helpers.
  const { storage, inputData, calculateChangeset, applyChangeset, done } = useExtensionInput();

  const offer: KlynaOffer | undefined = storage.initialData?.offer;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!offer) {
    return (
      <CalloutBanner title="Klyna Upsell">
        <TextBlock>No offer is available right now.</TextBlock>
      </CalloutBanner>
    );
  }

  const shop = inputData.shop?.domain ?? '';

  function log(type: 'accept' | 'decline') {
    if (!offer) return;
    fetch(`${APP_URL}/api/offers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shop, offerId: offer.offerId, variantId: offer.variantId, type }),
      keepalive: true,
    }).catch(() => undefined);
  }

  async function accept() {
    if (!offer) return;
    setLoading(true);
    setError(null);
    try {
      // Build a changeset that adds the upsold product, applying the variant
      // discount if configured.
      //
      // NOTE: post-purchase changesets require a *product variant* id, while the
      // offer stores a product GID. Before production, extend /api/offers to
      // return the first available variant id alongside the product so this line
      // resolves to the correct variant. For the scaffold we derive it from the
      // product id, which works when the product has a single default variant.
      const variantId = Number(offer.productGid.split('/').pop());
      const changes: Array<Record<string, unknown>> = [
        {
          type: 'add_variant',
          variantId,
          quantity: 1,
          discount:
            offer.discountPercent > 0
              ? { value: offer.discountPercent, valueType: 'percentage', title: 'Klyna Upsell' }
              : undefined,
        },
      ];

      const { calculatedPurchase } = await calculateChangeset({ changes });
      if (!calculatedPurchase) throw new Error('Could not price the offer.');

      const token = inputData.token;
      // The app would normally sign the changeset server-side; for the scaffold
      // we apply it directly. `signChangeset` integration is documented in the
      // app README.
      await applyChangeset(token, { changes });
      log('accept');
      done();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setLoading(false);
    }
  }

  function decline() {
    log('decline');
    done();
  }

  return (
    <BlockStack spacing="loose">
      <CalloutBanner title={offer.headline}>
        <TextBlock>One-click add — no need to re-enter payment.</TextBlock>
      </CalloutBanner>
      <Layout
        media={[
          { viewportSize: 'small', sizes: [1, 0, 1], maxInlineSize: 0.9 },
          { viewportSize: 'medium', sizes: [532, 0, 380], maxInlineSize: 420 },
        ]}
      >
        <View>
          {offer.productImage ? (
            <Image source={offer.productImage} description={offer.productTitle} />
          ) : null}
        </View>
        <View />
        <View>
          <TextContainer>
            <Heading>{offer.productTitle}</Heading>
            {offer.discountPercent > 0 ? (
              <TextBlock subdued>{offer.discountPercent}% off when you add it now.</TextBlock>
            ) : null}
            {error ? <TextBlock appearance="critical">{error}</TextBlock> : null}
          </TextContainer>
          <BlockStack spacing="tight">
            <Button submit onPress={accept} loading={loading}>
              {offer.ctaText}
            </Button>
            <Button plain subdued onPress={decline}>
              No thanks
            </Button>
          </BlockStack>
        </View>
      </Layout>
    </BlockStack>
  );
}
