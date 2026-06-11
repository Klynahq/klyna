// Klyna Feed — field/taxonomy mapping and include/exclude rules.
//
// Given a FeedConfig and a ProductView, resolveItem() produces the flat
// Record<FeedField, string> that the renderers turn into XML/CSV. shouldInclude()
// applies the merchant's include rules. Pure functions — no I/O — so they're
// trivially unit-testable and run identically on a webhook tick or in a loader.

import type {
  FeedConfig,
  FeedField,
  FieldMapEntry,
  IncludeRules,
  ProductAttr,
  ProductView,
} from './types';

export interface ExclusionResult {
  included: boolean;
  reason?: string;
}

// Resolve the raw value of a single product attribute.
function attrValue(view: ProductView, attr: ProductAttr): string {
  switch (attr) {
    case 'title':
      return view.title;
    case 'description':
      return view.description;
    case 'vendor':
      return view.vendor;
    case 'productType':
      return view.productType;
    case 'handle':
      return view.handle;
    case 'tags':
      return view.tags.join(', ');
    case 'sku':
      return view.sku;
    case 'barcode':
      return view.barcode;
    case 'price':
      return view.price;
    case 'compareAtPrice':
      return view.compareAtPrice ?? '';
    case 'image':
      return view.imageUrl ?? '';
    case 'availability':
      return view.available ? 'in stock' : 'out of stock';
    case 'optionColor':
      return view.options['color'] ?? '';
    case 'optionSize':
      return view.options['size'] ?? '';
    case 'optionMaterial':
      return view.options['material'] ?? '';
    default:
      return '';
  }
}

// Resolve one feed field through its mapping entry: metafield wins over source,
// source wins over fallback. Empty string means "unresolved".
function resolveField(
  view: ProductView,
  entry: FieldMapEntry | undefined,
): string {
  if (!entry) return '';
  if (entry.metafield) {
    const v = view.metafields[entry.metafield];
    if (v && v.trim()) return v.trim();
  }
  if (entry.source) {
    const v = attrValue(view, entry.source);
    if (v && v.trim()) return v.trim();
  }
  return entry.fallback?.trim() ?? '';
}

function moneyToNumber(price: string): number {
  const n = Number.parseFloat(price);
  return Number.isFinite(n) ? n : 0;
}

// Format a price as the spec wants: "12.99 USD".
function formatPrice(price: string, currency: string): string {
  const n = moneyToNumber(price);
  if (n <= 0) return '';
  return `${n.toFixed(2)} ${currency}`;
}

// Build the absolute storefront link for a product, including a UTM tag for
// attribution. Variant id is appended so deep-links land on the right variant.
function buildLink(shop: string, view: ProductView, channel: string): string {
  const base = `https://${shop}/products/${view.handle}`;
  const variantNumeric = view.variantId.split('/').pop();
  const params = new URLSearchParams({ utm_source: channel, utm_medium: 'cpc' });
  if (variantNumeric) params.set('variant', variantNumeric);
  return `${base}?${params.toString()}`;
}

// Map a Shopify productType / collection handle to a Google product category.
function resolveTaxonomy(config: FeedConfig, view: ProductView): string {
  const map = config.taxonomyMap;
  // Exact productType match first.
  if (view.productType && map[view.productType]) return map[view.productType]!;
  // Then any collection handle.
  for (const handle of view.collectionHandles) {
    if (map[handle]) return map[handle]!;
  }
  // Fall back to the shop-wide default.
  return config.defaultGoogleCategory ?? '';
}

// Produce the full resolved item: Record<FeedField, string>, empties omitted by
// the renderers. Handles the synthesized fields (link, item_group_id, price,
// sale_price, google_product_category) that don't come straight from a source.
export function resolveItem(
  config: FeedConfig,
  view: ProductView,
): Record<FeedField, string> {
  const out = {} as Record<FeedField, string>;
  const fm = config.fieldMap;

  // id: prefer the mapped field; fall back to variant id so it's never empty.
  out.id = resolveField(view, fm.id) || (view.variantId.split('/').pop() ?? view.variantId);

  out.title = resolveField(view, fm.title);
  out.description = resolveField(view, fm.description);

  // link is always synthesized from the handle so UTM + variant land correctly.
  out.link = buildLink(config.shop, view, config.channel);

  out.image_link = resolveField(view, fm.image_link) || (view.imageUrl ?? '');
  out.additional_image_link = view.additionalImages.join(',');

  out.availability = resolveField(view, fm.availability) || (view.available ? 'in stock' : 'out of stock');

  out.price = formatPrice(resolveField(view, fm.price) || view.price, config.currency);

  // sale_price only emits when there's a genuine compare-at markdown.
  const sale = resolveField(view, fm.sale_price) || view.price;
  const compareAt = view.compareAtPrice ? moneyToNumber(view.compareAtPrice) : 0;
  out.sale_price =
    compareAt > moneyToNumber(sale) ? formatPrice(sale, config.currency) : '';
  if (out.sale_price) {
    // When on sale, price should reflect the compare-at (the "was" price).
    out.price = formatPrice(view.compareAtPrice ?? view.price, config.currency);
  }

  out.brand = resolveField(view, fm.brand);
  out.gtin = resolveField(view, fm.gtin);
  out.mpn = resolveField(view, fm.mpn);
  out.condition = resolveField(view, fm.condition) || 'new';
  out.google_product_category = resolveField(view, fm.google_product_category) || resolveTaxonomy(config, view);
  out.product_type = resolveField(view, fm.product_type) || view.productType;

  // item_group_id groups variants of a product; always the product id.
  out.item_group_id = resolveField(view, fm.item_group_id) || view.itemGroupId;

  out.color = resolveField(view, fm.color);
  out.size = resolveField(view, fm.size);
  out.material = resolveField(view, fm.material);
  out.gender = resolveField(view, fm.gender);
  out.age_group = resolveField(view, fm.age_group);
  out.custom_label_0 = resolveField(view, fm.custom_label_0);

  return out;
}

// Apply include/exclude rules. Returns whether the item survives plus a reason
// if it was dropped (surfaced in the health report's excluded breakdown).
export function shouldInclude(rules: IncludeRules, view: ProductView): ExclusionResult {
  if (!rules.status.includes(view.status)) {
    return { included: false, reason: `status ${view.status}` };
  }
  if (rules.publishedOnly && !view.onlineStorePublished) {
    return { included: false, reason: 'not published to Online Store' };
  }
  if (rules.requireImage && !view.imageUrl) {
    return { included: false, reason: 'missing image' };
  }
  const price = moneyToNumber(view.price);
  if (rules.requirePrice && price <= 0) {
    return { included: false, reason: 'missing price' };
  }
  if (rules.collectionIds.length > 0) {
    const inAny = view.collectionIds.some((id) => rules.collectionIds.includes(id));
    if (!inAny) return { included: false, reason: 'not in selected collections' };
  }
  if (rules.excludeTags.length > 0) {
    const tagsLower = view.tags.map((t) => t.toLowerCase());
    const hit = rules.excludeTags.find((t) => tagsLower.includes(t.toLowerCase()));
    if (hit) return { included: false, reason: `excluded tag "${hit}"` };
  }
  if (rules.minPrice != null && price < rules.minPrice) {
    return { included: false, reason: `price below ${rules.minPrice}` };
  }
  if (rules.maxPrice != null && price > rules.maxPrice) {
    return { included: false, reason: `price above ${rules.maxPrice}` };
  }
  return { included: true };
}

export { formatPrice, buildLink };
