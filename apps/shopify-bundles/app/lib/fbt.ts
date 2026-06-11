// Klyna Bundles — frequently-bought-together miner.
//
// A small, dependency-free association-rule pass over order history. We count
// co-occurrence of product pairs across orders, then rank each anchor's
// partners by support (raw co-occurrence count) and confidence
// (P(partner | anchor)). This is the classic market-basket approach, scoped
// down to what a single store's order volume can support — no external ML.

export interface OrderBasket {
  /** Distinct product GIDs in one order (deduplicated). */
  productGids: string[];
}

export interface ProductMeta {
  title: string;
  imageUrl?: string | null;
  price?: number;
}

export interface FbtRecommendation {
  anchorGid: string;
  anchorTitle: string;
  recommendedGid: string;
  recommendedTitle: string;
  recommendedImage?: string | null;
  recommendedPrice: number;
  support: number;
  confidence: number;
}

/**
 * Mine FBT pairs from a list of order baskets.
 *
 * @param baskets    one entry per order, listing the products in it
 * @param meta       product GID → display metadata (title/image/price)
 * @param opts.minSupport   ignore pairs seen in fewer than this many orders
 * @param opts.perAnchor    keep at most this many partners per anchor
 */
export function mineFbt(
  baskets: OrderBasket[],
  meta: Map<string, ProductMeta>,
  opts: { minSupport?: number; perAnchor?: number } = {},
): FbtRecommendation[] {
  const minSupport = opts.minSupport ?? 2;
  const perAnchor = opts.perAnchor ?? 4;

  // anchorCount[a] = number of orders containing a.
  const anchorCount = new Map<string, number>();
  // pairCount["a|b"] = number of orders containing both a and b (a < b).
  const pairCount = new Map<string, number>();

  for (const basket of baskets) {
    const items = [...new Set(basket.productGids)].sort();
    for (let i = 0; i < items.length; i++) {
      const a = items[i];
      if (!a) continue;
      anchorCount.set(a, (anchorCount.get(a) ?? 0) + 1);
      for (let j = i + 1; j < items.length; j++) {
        const b = items[j];
        if (!b) continue;
        const key = `${a}|${b}`;
        pairCount.set(key, (pairCount.get(key) ?? 0) + 1);
      }
    }
  }

  // For each unordered pair, emit a recommendation in BOTH directions so each
  // product gets its own "frequently bought together" list.
  const byAnchor = new Map<string, FbtRecommendation[]>();
  const push = (anchor: string, partner: string, support: number) => {
    const anchorMeta = meta.get(anchor);
    const partnerMeta = meta.get(partner);
    if (!anchorMeta || !partnerMeta) return;
    const anchorTotal = anchorCount.get(anchor) ?? 0;
    const confidence = anchorTotal > 0 ? support / anchorTotal : 0;
    const list = byAnchor.get(anchor) ?? [];
    list.push({
      anchorGid: anchor,
      anchorTitle: anchorMeta.title,
      recommendedGid: partner,
      recommendedTitle: partnerMeta.title,
      recommendedImage: partnerMeta.imageUrl ?? null,
      recommendedPrice: partnerMeta.price ?? 0,
      support,
      confidence: Math.round(confidence * 1000) / 1000,
    });
    byAnchor.set(anchor, list);
  };

  for (const [key, support] of pairCount) {
    if (support < minSupport) continue;
    const [a, b] = key.split('|');
    if (!a || !b) continue;
    push(a, b, support);
    push(b, a, support);
  }

  // Rank each anchor's partners by support then confidence, trim to perAnchor.
  const out: FbtRecommendation[] = [];
  for (const list of byAnchor.values()) {
    list.sort((x, y) => y.support - x.support || y.confidence - x.confidence);
    out.push(...list.slice(0, perAnchor));
  }
  return out;
}
