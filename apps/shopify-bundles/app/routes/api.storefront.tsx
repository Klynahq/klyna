import { type LoaderFunctionArgs, json } from '@remix-run/node';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';
import { quoteBundle, type DiscountType } from '../lib/pricing';

// Public storefront data endpoint, served through the Shopify app proxy so the
// theme app extension can fetch a product's bundle + FBT data without exposing
// the admin session. Configure the proxy in shopify.app.toml (or the Partner
// dashboard) to forward `/apps/klyna-bundles/*` → this app's `/api/storefront`.
//
// Query params:
//   product  — the product GID the block is rendered on
//
// CORS is unnecessary because the request is same-origin via the proxy.

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);
  if (!session) {
    return json({ ok: false, error: 'No session' }, { status: 401 });
  }
  const shop = session.shop;

  const url = new URL(request.url);
  const productGid = url.searchParams.get('product') ?? '';

  const [settings, bundles, fbt, tiers] = await Promise.all([
    prisma.shopSettings.findUnique({ where: { shop } }),
    prisma.bundle.findMany({
      where: {
        shop,
        status: 'active',
        OR: [{ productGid }, { items: { some: { productGid } } }],
      },
      include: { items: { orderBy: { position: 'asc' } } },
      take: 3,
    }),
    productGid
      ? prisma.fbtPair.findMany({
          where: { shop, anchorGid: productGid },
          orderBy: [{ support: 'desc' }, { confidence: 'desc' }],
          take: 4,
        })
      : Promise.resolve([]),
    productGid
      ? prisma.volumeTier.findMany({
          where: { shop, productGid },
          orderBy: { minQuantity: 'asc' },
        })
      : Promise.resolve([]),
  ]);

  const bundlePayload = bundles.map((b) => {
    const quote = quoteBundle(
      b.items.map((it) => ({ price: it.price, quantity: it.quantity })),
      b.discountType as DiscountType,
      b.discountValue,
    );
    return {
      id: b.id,
      title: b.title,
      kind: b.kind,
      minItems: b.minItems,
      items: b.items.map((it) => ({
        productGid: it.productGid,
        variantGid: it.variantGid,
        title: it.title,
        imageUrl: it.imageUrl,
        price: it.price,
        quantity: it.quantity,
      })),
      subtotal: quote.subtotal,
      total: quote.total,
      savings: quote.savings,
      savingsPercent: quote.savingsPercent,
    };
  });

  return json({
    ok: true,
    settings: {
      priceDisplay: settings?.priceDisplay ?? 'total',
      widgetHeading: settings?.widgetHeading ?? 'Frequently bought together',
      bundleHeading: settings?.bundleHeading ?? 'Complete the set & save',
      accentColor: settings?.accentColor ?? '#7c5cff',
      showSavingsBadge: settings?.showSavingsBadge ?? true,
    },
    bundles: bundlePayload,
    fbt: fbt.map((f) => ({
      productGid: f.recommendedGid,
      title: f.recommendedTitle,
      imageUrl: f.recommendedImage,
      price: f.recommendedPrice,
    })),
    volumeTiers: tiers.map((t) => ({
      minQuantity: t.minQuantity,
      discountType: t.discountType,
      discountValue: t.discountValue,
      label: t.label,
    })),
  });
};
