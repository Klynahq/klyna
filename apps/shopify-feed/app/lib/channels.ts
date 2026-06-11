// Klyna Feed — channel definitions and sane defaults.
//
// Google, Meta, TikTok, and Pinterest all derive their product spec from the
// Google Shopping spec, so we keep one internal field vocabulary and vary the
// required-field set and the output format per channel.

import type {
  Channel,
  FeedField,
  FeedFormat,
  FieldMap,
  IncludeRules,
} from './types';

export interface ChannelDef {
  id: Channel;
  label: string;
  // The native delivery format the channel ingests.
  format: FeedFormat;
  // Fields the channel rejects items for when missing — these drive errors.
  required: FeedField[];
  // Fields the channel strongly recommends — missing => warnings.
  recommended: FeedField[];
  docsUrl: string;
}

export const CHANNELS: Record<Channel, ChannelDef> = {
  google: {
    id: 'google',
    label: 'Google Shopping',
    format: 'xml',
    required: ['id', 'title', 'description', 'link', 'image_link', 'availability', 'price'],
    recommended: ['brand', 'gtin', 'mpn', 'google_product_category', 'condition'],
    docsUrl: 'https://support.google.com/merchants/answer/7052112',
  },
  meta: {
    id: 'meta',
    label: 'Meta (Facebook / Instagram)',
    format: 'csv',
    required: ['id', 'title', 'description', 'link', 'image_link', 'availability', 'price', 'condition', 'brand'],
    recommended: ['gtin', 'mpn', 'google_product_category', 'item_group_id'],
    docsUrl: 'https://www.facebook.com/business/help/120325381656392',
  },
  tiktok: {
    id: 'tiktok',
    label: 'TikTok',
    format: 'csv',
    required: ['id', 'title', 'description', 'link', 'image_link', 'availability', 'price', 'condition', 'brand'],
    recommended: ['gtin', 'google_product_category', 'item_group_id'],
    docsUrl: 'https://ads.tiktok.com/help/article/product-catalog',
  },
  pinterest: {
    id: 'pinterest',
    label: 'Pinterest',
    format: 'csv',
    required: ['id', 'title', 'description', 'link', 'image_link', 'availability', 'price'],
    recommended: ['brand', 'google_product_category', 'product_type', 'condition'],
    docsUrl: 'https://help.pinterest.com/en/business/article/data-source-ingestion',
  },
};

export const CHANNEL_LIST: ChannelDef[] = Object.values(CHANNELS);

// The full ordered column set Klyna can emit. CSV output uses this order;
// XML output uses the same set but skips empty <g:*> nodes.
export const FEED_FIELD_ORDER: FeedField[] = [
  'id',
  'title',
  'description',
  'link',
  'image_link',
  'additional_image_link',
  'availability',
  'price',
  'sale_price',
  'brand',
  'gtin',
  'mpn',
  'condition',
  'google_product_category',
  'product_type',
  'item_group_id',
  'color',
  'size',
  'material',
  'gender',
  'age_group',
  'custom_label_0',
];

// Default field mapping applied to a brand-new feed. Maps each feed field onto
// the most likely Shopify source so the feed is useful before any tuning.
export function defaultFieldMap(): FieldMap {
  return {
    id: { source: 'sku' },
    title: { source: 'title' },
    description: { source: 'description' },
    link: { source: 'handle' },
    image_link: { source: 'image' },
    availability: { source: 'availability' },
    price: { source: 'price' },
    sale_price: { source: 'price' },
    brand: { source: 'vendor' },
    gtin: { source: 'barcode' },
    mpn: { source: 'sku' },
    condition: { source: '', fallback: 'new' },
    product_type: { source: 'productType' },
    item_group_id: { source: '' }, // filled from the product id automatically
    color: { source: 'optionColor' },
    size: { source: 'optionSize' },
    material: { source: 'optionMaterial' },
  };
}

export function defaultIncludeRules(): IncludeRules {
  return {
    status: ['ACTIVE'],
    publishedOnly: true,
    requireImage: true,
    requirePrice: true,
    collectionIds: [],
    excludeTags: [],
    minPrice: null,
    maxPrice: null,
  };
}

// Human-friendly labels for product attributes shown in the mapping UI.
export const PRODUCT_ATTR_LABELS: Record<string, string> = {
  '': '— none —',
  title: 'Product title',
  description: 'Description (HTML stripped)',
  vendor: 'Vendor',
  productType: 'Product type',
  handle: 'Handle (builds the link)',
  tags: 'Tags (comma-joined)',
  sku: 'Variant SKU',
  barcode: 'Variant barcode',
  price: 'Variant price',
  compareAtPrice: 'Compare-at price',
  image: 'Featured / variant image',
  availability: 'Availability (in stock / out of stock)',
  optionColor: 'Option: Color',
  optionSize: 'Option: Size',
  optionMaterial: 'Option: Material',
};

export const FEED_FIELD_LABELS: Record<FeedField, string> = {
  id: 'id',
  title: 'title',
  description: 'description',
  link: 'link',
  image_link: 'image_link',
  additional_image_link: 'additional_image_link',
  availability: 'availability',
  price: 'price',
  sale_price: 'sale_price',
  brand: 'brand',
  gtin: 'gtin',
  mpn: 'mpn',
  condition: 'condition',
  google_product_category: 'google_product_category',
  product_type: 'product_type',
  item_group_id: 'item_group_id',
  color: 'color',
  size: 'size',
  material: 'material',
  gender: 'gender',
  age_group: 'age_group',
  custom_label_0: 'custom_label_0',
};
