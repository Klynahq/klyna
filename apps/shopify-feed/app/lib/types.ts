// Klyna Feed — shared domain types.
//
// These describe the shape of a feed config (mapping + rules), the normalized
// product shape we pull from the Admin API, and the health report we compute
// at generation time. Everything that crosses the loader/action boundary or
// gets serialized into Prisma JSON columns is typed here.

export type Channel = 'google' | 'meta' | 'tiktok' | 'pinterest';
export type FeedFormat = 'xml' | 'csv';

// The canonical feed fields Klyna knows how to emit. These map onto the
// columns Google Shopping / Meta / TikTok / Pinterest all share (they use the
// same Google-derived spec), so one internal vocabulary drives every channel.
export type FeedField =
  | 'id'
  | 'title'
  | 'description'
  | 'link'
  | 'image_link'
  | 'additional_image_link'
  | 'availability'
  | 'price'
  | 'sale_price'
  | 'brand'
  | 'gtin'
  | 'mpn'
  | 'condition'
  | 'google_product_category'
  | 'product_type'
  | 'item_group_id'
  | 'color'
  | 'size'
  | 'material'
  | 'gender'
  | 'age_group'
  | 'custom_label_0';

// Where a feed field's value comes from. `source` is a product attribute key
// (see ProductView), `metafield` is "namespace.key", `fallback` is a literal
// used when the resolved value is empty.
export interface FieldMapEntry {
  source?: ProductAttr | '';
  metafield?: string;
  fallback?: string;
}

export type FieldMap = Partial<Record<FeedField, FieldMapEntry>>;

// Maps a Shopify productType or collection handle to a Google product category
// id (the numeric taxonomy id, e.g. "166" = Apparel & Accessories).
export type TaxonomyMap = Record<string, string>;

export interface IncludeRules {
  // Only ACTIVE products by default; allow DRAFT/ARCHIVED opt-in.
  status: ('ACTIVE' | 'DRAFT' | 'ARCHIVED')[];
  // Require the product to be published to the Online Store channel.
  publishedOnly: boolean;
  // Drop variants/products with no image.
  requireImage: boolean;
  // Drop items priced at 0 / with no price.
  requirePrice: boolean;
  // Only include products in these collection ids (empty = all).
  collectionIds: string[];
  // Exclude products carrying any of these tags.
  excludeTags: string[];
  // Price window (in the store's currency). null = unbounded.
  minPrice: number | null;
  maxPrice: number | null;
}

export interface FeedConfig {
  id: string;
  shop: string;
  name: string;
  channel: Channel;
  format: FeedFormat;
  language: string;
  currency: string;
  fieldMap: FieldMap;
  taxonomyMap: TaxonomyMap;
  includeRules: IncludeRules;
  metafieldNamespace: string;
  defaultGoogleCategory: string | null;
  // AI-generated per-channel title overrides, keyed by productId.
  titleOverrides?: Record<string, string>;
}

// Product attributes we can map a feed field onto.
export type ProductAttr =
  | 'title'
  | 'description'
  | 'vendor'
  | 'productType'
  | 'handle'
  | 'tags'
  | 'sku'
  | 'barcode'
  | 'price'
  | 'compareAtPrice'
  | 'image'
  | 'availability'
  | 'optionColor'
  | 'optionSize'
  | 'optionMaterial';

// A flattened per-variant view of a product, already merged with its parent
// and metafields. One ProductView = one feed item (one row / one <item>).
export interface ProductView {
  productId: string;
  variantId: string;
  handle: string;
  title: string;
  variantTitle: string;
  description: string;
  vendor: string;
  productType: string;
  tags: string[];
  status: 'ACTIVE' | 'DRAFT' | 'ARCHIVED';
  onlineStorePublished: boolean;
  collectionHandles: string[];
  collectionIds: string[];

  sku: string;
  barcode: string;
  price: string;
  compareAtPrice: string | null;
  available: boolean;

  imageUrl: string | null;
  additionalImages: string[];

  options: Record<string, string>; // normalized lowercase option name -> value
  metafields: Record<string, string>; // "namespace.key" -> value
  itemGroupId: string; // the product id, so variants group together
}

// A health issue attached to a feed run (or a single item).
export interface HealthIssue {
  // Stable id for dedup/sorting.
  id: string;
  field: FeedField | 'general';
  severity: 'error' | 'warn' | 'info';
  message: string;
  // How many items are affected by this issue.
  count: number;
  // A few example item ids for drill-down.
  sampleIds: string[];
}

export interface FeedHealth {
  score: number; // 0-100
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  issues: HealthIssue[];
}

export interface GeneratedFeed {
  body: string;
  contentType: 'text/xml' | 'text/csv';
  itemCount: number;
  includedCount: number;
  excludedCount: number;
  warningCount: number;
  health: FeedHealth;
}
