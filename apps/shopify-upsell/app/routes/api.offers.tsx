import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/node';
import prisma from '../db.server';
import { pickVariant } from '../models/offers.server';

// Storefront-facing offer endpoint. The theme app extension (cart-upsell block)
// calls this directly from the browser, so it is unauthenticated by design and
// CORS-enabled. It never exposes anything beyond live offers the merchant
// configured; all writes are append-only event rows.
//
//   GET  /api/offers?shop=...&cartTotal=...&products=gid,gid&collections=gid,gid&cartToken=...
//        → the single best-matching offer + the A/B variant to render, and
//          logs an impression.
//   POST /api/offers  { shop, offerId, variantId, type: 'accept'|'decline', revenue? }
//        → logs an accept/decline event.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Only serve shops we actually have an installed session for.
async function shopIsInstalled(shop: string): Promise<boolean> {
  const count = await prisma.session.count({ where: { shop } });
  return count > 0;
}

function csv(value: string | null): string[] {
  return (value ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get('shop') ?? '';
  if (!shop || !(await shopIsInstalled(shop))) {
    return json({ offer: null }, { headers: CORS });
  }

  const cartTotal = Number(url.searchParams.get('cartTotal') ?? '0'); // minor units
  const productGids = csv(url.searchParams.get('products'));
  const collectionGids = csv(url.searchParams.get('collections'));
  const cartToken = url.searchParams.get('cartToken') ?? undefined;
  const placement = url.searchParams.get('placement') ?? 'cart';

  const offers = await prisma.offer.findMany({
    where: { shop, enabled: true, placement },
    include: { variants: { orderBy: { label: 'asc' } } },
    orderBy: { createdAt: 'desc' },
  });

  // First offer whose trigger the current cart satisfies wins. Skip offers that
  // would recommend something already in the cart.
  const inCart = new Set(productGids);
  const match = offers.find((offer) => {
    if (!triggerMatches(offer, { cartTotal, productGids, collectionGids })) return false;
    return offer.variants.some((v) => !inCart.has(v.productGid));
  });

  if (!match) {
    return json({ offer: null }, { headers: CORS });
  }

  const candidates = match.variants.filter((v) => !inCart.has(v.productGid));
  const variant = pickVariant(candidates, match.splitA, cartToken);
  if (!variant) {
    return json({ offer: null }, { headers: CORS });
  }

  // Log the impression. Best-effort — never block the storefront on it.
  await prisma.offerEvent
    .create({ data: { shop, offerId: match.id, variantId: variant.id, type: 'impression' } })
    .catch(() => undefined);

  return json(
    {
      offer: {
        offerId: match.id,
        variantId: variant.id,
        productGid: variant.productGid,
        productHandle: variant.productHandle,
        productTitle: variant.productTitle,
        productImage: variant.productImage,
        headline: variant.headline,
        ctaText: variant.ctaText,
        discountPercent: variant.discountPercent,
      },
    },
    { headers: CORS },
  );
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: CORS });
  }

  const payload = (await request.json().catch(() => null)) as
    | { shop?: string; offerId?: string; variantId?: string; type?: string; revenue?: number }
    | null;
  if (!payload?.shop || !payload.offerId || !payload.variantId) {
    return json({ ok: false }, { status: 400, headers: CORS });
  }
  if (!(await shopIsInstalled(payload.shop))) {
    return json({ ok: false }, { status: 403, headers: CORS });
  }

  const type = payload.type === 'accept' || payload.type === 'decline' ? payload.type : null;
  if (!type) {
    return json({ ok: false }, { status: 400, headers: CORS });
  }

  // Guard the offer/variant actually belong to this shop before writing.
  const variant = await prisma.offerVariant.findFirst({
    where: { id: payload.variantId, offer: { id: payload.offerId, shop: payload.shop } },
  });
  if (!variant) {
    return json({ ok: false }, { status: 404, headers: CORS });
  }

  await prisma.offerEvent.create({
    data: {
      shop: payload.shop,
      offerId: payload.offerId,
      variantId: payload.variantId,
      type,
      // Optimistic revenue from the widget; the orders/create webhook confirms it.
      revenue: type === 'accept' ? Math.max(0, Math.round(payload.revenue ?? 0)) : 0,
    },
  });

  return json({ ok: true }, { headers: CORS });
};

interface CartContext {
  cartTotal: number;
  productGids: string[];
  collectionGids: string[];
}

// The rules engine, evaluated against the live cart.
function triggerMatches(
  offer: { triggerType: string; triggerValue: string },
  cart: CartContext,
): boolean {
  switch (offer.triggerType) {
    case 'product':
      return cart.productGids.includes(offer.triggerValue);
    case 'collection':
      return cart.collectionGids.includes(offer.triggerValue);
    case 'cart_value':
      return cart.cartTotal >= Number(offer.triggerValue || '0');
    default:
      return false;
  }
}
