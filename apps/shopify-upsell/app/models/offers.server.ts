// Klyna Upsell — server-side offer + analytics helpers.
//
// Shared by the admin routes and the storefront API endpoint so the rules
// engine and the metrics math live in exactly one place.

import prisma from '../db.server';

export type TriggerType = 'product' | 'collection' | 'cart_value';
export type Placement = 'cart' | 'post_purchase';

export const TRIGGER_TYPES: TriggerType[] = ['product', 'collection', 'cart_value'];
export const PLACEMENTS: Placement[] = ['cart', 'post_purchase'];

// Variant-level rollup for the analytics dashboard.
export interface VariantStats {
  variantId: string;
  label: string;
  productTitle: string;
  impressions: number;
  accepts: number;
  // Accepts that were confirmed by an orders/create webhook.
  conversions: number;
  // Confirmed revenue in minor units.
  revenue: number;
  // accepts / impressions.
  conversionRate: number;
}

export interface OfferStats {
  offerId: string;
  name: string;
  enabled: boolean;
  placement: string;
  triggerType: string;
  impressions: number;
  accepts: number;
  conversions: number;
  revenue: number;
  conversionRate: number;
  variants: VariantStats[];
}

export interface ShopTotals {
  impressions: number;
  accepts: number;
  conversions: number;
  revenue: number;
  conversionRate: number;
}

function rate(accepts: number, impressions: number): number {
  return impressions === 0 ? 0 : accepts / impressions;
}

// Pull every event for the shop and fold it into per-offer / per-variant
// rollups. One query per relation keeps this cheap on SQLite.
export async function getShopStats(shop: string): Promise<{
  totals: ShopTotals;
  offers: OfferStats[];
}> {
  const offers = await prisma.offer.findMany({
    where: { shop },
    include: { variants: true },
    orderBy: { createdAt: 'desc' },
  });

  const events = await prisma.offerEvent.findMany({
    where: { shop },
    select: {
      offerId: true,
      variantId: true,
      type: true,
      revenue: true,
      orderGid: true,
    },
  });

  // variantId → counters.
  const byVariant = new Map<
    string,
    { impressions: number; accepts: number; conversions: number; revenue: number }
  >();
  for (const ev of events) {
    const v = byVariant.get(ev.variantId) ?? {
      impressions: 0,
      accepts: 0,
      conversions: 0,
      revenue: 0,
    };
    if (ev.type === 'impression') v.impressions += 1;
    if (ev.type === 'accept') {
      v.accepts += 1;
      if (ev.orderGid) {
        v.conversions += 1;
        v.revenue += ev.revenue;
      }
    }
    byVariant.set(ev.variantId, v);
  }

  const offerStats: OfferStats[] = offers.map((offer) => {
    const variants: VariantStats[] = offer.variants.map((variant) => {
      const c = byVariant.get(variant.id) ?? {
        impressions: 0,
        accepts: 0,
        conversions: 0,
        revenue: 0,
      };
      return {
        variantId: variant.id,
        label: variant.label,
        productTitle: variant.productTitle,
        impressions: c.impressions,
        accepts: c.accepts,
        conversions: c.conversions,
        revenue: c.revenue,
        conversionRate: rate(c.accepts, c.impressions),
      };
    });

    const impressions = variants.reduce((s, v) => s + v.impressions, 0);
    const accepts = variants.reduce((s, v) => s + v.accepts, 0);
    const conversions = variants.reduce((s, v) => s + v.conversions, 0);
    const revenue = variants.reduce((s, v) => s + v.revenue, 0);

    return {
      offerId: offer.id,
      name: offer.name,
      enabled: offer.enabled,
      placement: offer.placement,
      triggerType: offer.triggerType,
      impressions,
      accepts,
      conversions,
      revenue,
      conversionRate: rate(accepts, impressions),
      variants,
    };
  });

  const totals: ShopTotals = {
    impressions: offerStats.reduce((s, o) => s + o.impressions, 0),
    accepts: offerStats.reduce((s, o) => s + o.accepts, 0),
    conversions: offerStats.reduce((s, o) => s + o.conversions, 0),
    revenue: offerStats.reduce((s, o) => s + o.revenue, 0),
    conversionRate: 0,
  };
  totals.conversionRate = rate(totals.accepts, totals.impressions);

  return { totals, offers: offerStats };
}

// Pick which A/B variant to serve for a given impression. Deterministic when a
// stable bucketing key (cart token) is supplied so a shopper sees a consistent
// variant across page loads; random otherwise.
export function pickVariant<T extends { label: string }>(
  variants: T[],
  splitA: number,
  bucketKey?: string,
): T | undefined {
  if (variants.length === 0) return undefined;
  const a = variants.find((v) => v.label === 'A') ?? variants[0];
  const b = variants.find((v) => v.label === 'B');
  if (!b) return a;

  const roll = bucketKey ? hashToUnit(bucketKey) * 100 : Math.random() * 100;
  return roll < splitA ? a : b;
}

// Cheap, stable string → [0,1) hash (FNV-1a) for sticky A/B bucketing.
function hashToUnit(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0xffffffff;
}

// Format minor units (cents) → display string. Currency-symbol-agnostic; the
// storefront passes its own symbol, the admin defaults to "$".
export function formatMoney(minor: number, symbol = '$'): string {
  return `${symbol}${(minor / 100).toFixed(2)}`;
}

// Shape the offer editor posts. Parsed from FormData in the route action.
export interface OfferInput {
  name: string;
  enabled: boolean;
  triggerType: TriggerType;
  triggerValue: string;
  placement: Placement;
  splitA: number;
  variants: VariantInput[];
}

export interface VariantInput {
  label: string;
  productGid: string;
  productHandle: string;
  productTitle: string;
  productImage: string | null;
  headline: string;
  ctaText: string;
  discountPercent: number;
}

// Pull an OfferInput out of a submitted form. Variant fields are namespaced
// `a.*` and `b.*`; the B variant is only included when a B product was picked.
export function parseOfferForm(form: FormData): { input: OfferInput; errors: string[] } {
  const errors: string[] = [];

  const name = String(form.get('name') ?? '').trim();
  if (!name) errors.push('Name is required.');

  const triggerType = String(form.get('triggerType') ?? 'product') as TriggerType;
  if (!TRIGGER_TYPES.includes(triggerType)) errors.push('Invalid trigger type.');

  const triggerValue = String(form.get('triggerValue') ?? '').trim();
  if (!triggerValue) {
    errors.push(
      triggerType === 'cart_value'
        ? 'Enter a minimum cart value.'
        : 'Pick a trigger product or collection.',
    );
  }
  if (triggerType === 'cart_value' && Number.isNaN(Number(triggerValue))) {
    errors.push('Cart value must be a number.');
  }

  const placement = String(form.get('placement') ?? 'cart') as Placement;
  if (!PLACEMENTS.includes(placement)) errors.push('Invalid placement.');

  const splitA = clampInt(Number(form.get('splitA') ?? 50), 0, 100);

  const variants: VariantInput[] = [];
  const a = readVariant(form, 'a', 'A');
  if (!a.productGid) errors.push('Pick a product for variant A.');
  variants.push(a);

  // B is optional — present only when an A/B test product was chosen.
  if (String(form.get('b.productGid') ?? '').trim()) {
    variants.push(readVariant(form, 'b', 'B'));
  }

  return {
    input: { name, enabled: form.get('enabled') === 'on', triggerType, triggerValue, placement, splitA, variants },
    errors,
  };
}

function readVariant(form: FormData, prefix: string, label: string): VariantInput {
  return {
    label,
    productGid: String(form.get(`${prefix}.productGid`) ?? '').trim(),
    productHandle: String(form.get(`${prefix}.productHandle`) ?? '').trim(),
    productTitle: String(form.get(`${prefix}.productTitle`) ?? '').trim(),
    productImage: String(form.get(`${prefix}.productImage`) ?? '').trim() || null,
    headline: String(form.get(`${prefix}.headline`) ?? '').trim() || 'You might also like',
    ctaText: String(form.get(`${prefix}.ctaText`) ?? '').trim() || 'Add to order',
    discountPercent: clampInt(Number(form.get(`${prefix}.discountPercent`) ?? 0), 0, 100),
  };
}

function clampInt(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}

// Create or update an offer + its variants transactionally. Variants are
// replaced wholesale (delete + recreate) so an A/B test can drop down to a solo
// offer cleanly.
export async function saveOffer(
  shop: string,
  input: OfferInput,
  offerId?: string,
): Promise<string> {
  return prisma.$transaction(async (tx) => {
    let id = offerId;

    if (id) {
      // Confirm ownership before mutating.
      const existing = await tx.offer.findFirst({ where: { id, shop } });
      if (!existing) throw new Response('Offer not found', { status: 404 });
      await tx.offer.update({
        where: { id },
        data: {
          name: input.name,
          enabled: input.enabled,
          triggerType: input.triggerType,
          triggerValue: input.triggerValue,
          placement: input.placement,
          splitA: input.splitA,
        },
      });
      await tx.offerVariant.deleteMany({ where: { offerId: id } });
    } else {
      const created = await tx.offer.create({
        data: {
          shop,
          name: input.name,
          enabled: input.enabled,
          triggerType: input.triggerType,
          triggerValue: input.triggerValue,
          placement: input.placement,
          splitA: input.splitA,
        },
      });
      id = created.id;
    }

    await tx.offerVariant.createMany({
      data: input.variants.map((v) => ({
        offerId: id as string,
        label: v.label,
        productGid: v.productGid,
        productHandle: v.productHandle,
        productTitle: v.productTitle,
        productImage: v.productImage,
        headline: v.headline,
        ctaText: v.ctaText,
        discountPercent: v.discountPercent,
      })),
    });

    return id as string;
  });
}
