// Klyna Bundles — pricing & discount math.
//
// Pure functions, no Shopify or Prisma imports. Shared by the admin routes
// (to preview savings) and the storefront block's loader (to render the
// discounted price). Keeping the math here means the admin preview and the
// live widget can never drift apart.

export type DiscountType = 'percentage' | 'fixed_amount';

export interface PricedItem {
  /** Unit price in the store's currency (major units, e.g. dollars). */
  price: number;
  quantity: number;
}

/** Round to 2 decimal places without floating-point dust (e.g. 19.999 → 20). */
export function money(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Sum of price × quantity across items, before any discount. */
export function subtotal(items: PricedItem[]): number {
  return money(items.reduce((sum, it) => sum + it.price * it.quantity, 0));
}

/**
 * Apply a single discount to a subtotal. A percentage discount of 10 means
 * "10% off"; a fixed_amount of 10 means "$10 off". The result is clamped to
 * never go below zero.
 */
export function applyDiscount(
  base: number,
  type: DiscountType,
  value: number,
): number {
  if (base <= 0 || value <= 0) return money(Math.max(0, base));
  const discounted =
    type === 'percentage' ? base * (1 - value / 100) : base - value;
  return money(Math.max(0, discounted));
}

export interface BundleQuote {
  subtotal: number;
  total: number;
  savings: number;
  /** Effective percentage off, for the savings badge ("Save 15%"). */
  savingsPercent: number;
}

/** Quote a fixed/mix-and-match bundle: subtotal, discounted total, savings. */
export function quoteBundle(
  items: PricedItem[],
  type: DiscountType,
  value: number,
): BundleQuote {
  const sub = subtotal(items);
  const total = applyDiscount(sub, type, value);
  const savings = money(sub - total);
  const savingsPercent = sub > 0 ? Math.round((savings / sub) * 100) : 0;
  return { subtotal: sub, total, savings, savingsPercent };
}

export interface VolumeTierInput {
  minQuantity: number;
  discountType: DiscountType;
  discountValue: number;
  label?: string | null;
}

export interface VolumeQuote {
  quantity: number;
  /** The tier that applies at this quantity, or null if none qualifies. */
  appliedTier: VolumeTierInput | null;
  unitPrice: number;
  effectiveUnitPrice: number;
  lineTotal: number;
  savings: number;
}

/**
 * Pick the best volume tier for a given quantity. Tiers are evaluated by
 * highest `minQuantity` first, so a "buy 10+" tier wins over "buy 3+" once
 * the customer crosses 10. The discount applies per-unit across the whole line.
 */
export function quoteVolume(
  unitPrice: number,
  quantity: number,
  tiers: VolumeTierInput[],
): VolumeQuote {
  const eligible = tiers
    .filter((t) => quantity >= t.minQuantity)
    .sort((a, b) => b.minQuantity - a.minQuantity);
  const appliedTier = eligible[0] ?? null;
  const effectiveUnitPrice = appliedTier
    ? applyDiscount(unitPrice, appliedTier.discountType, appliedTier.discountValue)
    : unitPrice;
  const lineTotal = money(effectiveUnitPrice * quantity);
  const savings = money(unitPrice * quantity - lineTotal);
  return {
    quantity,
    appliedTier,
    unitPrice: money(unitPrice),
    effectiveUnitPrice,
    lineTotal,
    savings,
  };
}

/**
 * Normalize a tier list into ascending, de-duplicated break points. Used when
 * persisting from the admin form so the storefront always sees a clean ladder.
 */
export function normalizeTiers<T extends { minQuantity: number }>(tiers: T[]): T[] {
  const byMin = new Map<number, T>();
  for (const t of tiers) {
    if (t.minQuantity > 1) byMin.set(t.minQuantity, t);
  }
  return [...byMin.values()].sort((a, b) => a.minQuantity - b.minQuantity);
}
