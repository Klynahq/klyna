import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/node';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';
import { pickVariant } from '../models/offers.server';

// Storefront-facing offer endpoint. The theme app extension (cart-upsell block)
// calls this through the Shopify App Proxy, so the shop is authenticated by
// Shopify (HMAC-signed) rather than trusted from a client-supplied param.
//
// Configure the proxy in shopify.app.toml (or the Partner dashboard) to
// forward `/apps/klyna-upsell/*` → this app's `/api/offers`.
//
//   GET  /api/offers?cartTotal=...&products=gid,gid&collections=gid,gid&cartToken=...
//        → the single best-matching offer + the A/B variant to render, and
//          logs an impression.
//   POST /api/offers  { offerId, variantId, type: 'accept'|'decline' }
//        → logs an accept/decline event. The orders/create webhook is the
//          authoritative source for revenue; the event is marked verified
//          only after that webhook attaches an orderGid + revenue.

function csv(value: string | null): string[] {
  return (value ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

// Simple in-process rate limiter: max 100 events per (shop, offerId) per
// 60-second window. Good enough for a single-node deploy; swap for Redis if
// we ever run multiple instances.
const RATE_LIMIT_MAX = 100;
const RATE_LIMIT_WINDOW_MS = 60_000;
const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

function rateLimitHit(shop: string, offerId: string): boolean {
  const key = `${shop}::${offerId}`;
  const now = Date.now();
  const bucket = rateLimitBuckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  bucket.count += 1;
  return bucket.count > RATE_LIMIT_MAX;
}

const OFFER_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);
  if (!session) {
    return json({ offer: null }, { status: 401 });
  }
  const shop = session.shop;

  const url = new URL(request.url);
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
    return json({ offer: null });
  }

  const candidates = match.variants.filter((v) => !inCart.has(v.productGid));
  const variant = pickVariant(candidates, match.splitA, cartToken);
  if (!variant) {
    return json({ offer: null });
  }

  if (rateLimitHit(shop, match.id)) {
    return json({ offer: null }, { status: 429 });
  }

  // Log the impression. Best-effort — never block the storefront on it.
  await prisma.offerEvent
    .create({ data: { shop, offerId: match.id, variantId: variant.id, type: 'impression' } })
    .catch(() => undefined);

  return json({
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
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);
  if (!session) {
    return json({ ok: false }, { status: 401 });
  }
  const shop = session.shop;

  const payload = (await request.json().catch(() => null)) as
    | { offerId?: string; variantId?: string; type?: string }
    | null;
  if (!payload?.offerId || !payload.variantId) {
    return json({ ok: false }, { status: 400 });
  }
  if (!OFFER_ID_RE.test(payload.offerId) || !OFFER_ID_RE.test(payload.variantId)) {
    return json({ ok: false }, { status: 400 });
  }

  const type = payload.type === 'accept' || payload.type === 'decline' ? payload.type : null;
  if (!type) {
    return json({ ok: false }, { status: 400 });
  }

  if (rateLimitHit(shop, payload.offerId)) {
    return json({ ok: false }, { status: 429 });
  }

  // Guard the offer/variant actually belong to this shop before writing.
  const variant = await prisma.offerVariant.findFirst({
    where: { id: payload.variantId, offer: { id: payload.offerId, shop } },
  });
  if (!variant) {
    return json({ ok: false }, { status: 404 });
  }

  // Revenue is intentionally NOT taken from the client. The orders/create
  // webhook is the authoritative source — it backfills `revenue` and
  // `orderGid` on the matching event row. Until then the event row has
  // revenue: 0, which the analytics layer treats as unverified.
  await prisma.offerEvent.create({
    data: {
      shop,
      offerId: payload.offerId,
      variantId: payload.variantId,
      type,
      revenue: 0,
    },
  });

  return json({ ok: true });
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
