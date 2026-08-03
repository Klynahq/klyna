// Klyna Feed — product fetching via the Admin GraphQL API.
//
// We page through products with cursor pagination and flatten each product +
// variant into a ProductView (one feed item). Metafields are pulled in the
// merchant's configured namespace so per-product feed overrides resolve.

import type { ProductView } from './types';

// `admin` is the GraphQLClient returned by authenticate.admin(...).admin. We
// keep it loosely typed (the @shopify package's generics are heavy and the
// shape is stable) and lean on the typed normalizer below.
type AdminClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

const PRODUCTS_QUERY = `#graphql
  query KlynaFeedProducts($cursor: String, $namespace: String!) {
    products(first: 50, after: $cursor, sortKey: ID) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        handle
        title
        descriptionHtml
        vendor
        productType
        status
        tags
        onlineStoreUrl
        featuredImage {
          url
        }
        images(first: 10) {
          nodes {
            url
          }
        }
        collections(first: 25) {
          nodes {
            id
            handle
          }
        }
        metafields(first: 30, namespace: $namespace) {
          nodes {
            namespace
            key
            value
          }
        }
        variants(first: 100) {
          nodes {
            id
            title
            sku
            barcode
            price
            compareAtPrice
            availableForSale
            image {
              url
            }
            selectedOptions {
              name
              value
            }
          }
        }
      }
    }
  }
`;

interface RawVariant {
  id: string;
  title: string;
  sku: string | null;
  barcode: string | null;
  price: string;
  compareAtPrice: string | null;
  availableForSale: boolean;
  image: { url: string } | null;
  selectedOptions: { name: string; value: string }[];
}

interface RawProduct {
  id: string;
  handle: string;
  title: string;
  descriptionHtml: string;
  vendor: string;
  productType: string;
  status: 'ACTIVE' | 'DRAFT' | 'ARCHIVED';
  tags: string[];
  onlineStoreUrl: string | null;
  featuredImage: { url: string } | null;
  images: { nodes: { url: string }[] };
  collections: { nodes: { id: string; handle: string }[] };
  metafields: { nodes: { namespace: string; key: string; value: string }[] };
  variants: { nodes: RawVariant[] };
}

// Strip HTML to plain text for description fields (feeds want text, not markup).
function stripHtml(html: string): string {
  return html
    .replace(/<\s*br\s*\/?\s*>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6])>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

const OPTION_ALIASES: Record<string, string> = {
  color: 'color',
  colour: 'color',
  size: 'size',
  material: 'material',
  fabric: 'material',
};

function normalizeOptions(opts: { name: string; value: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const o of opts) {
    const key = o.name.trim().toLowerCase();
    out[key] = o.value;
    const alias = OPTION_ALIASES[key];
    if (alias && !out[alias]) out[alias] = o.value;
  }
  return out;
}

function flatten(product: RawProduct): ProductView[] {
  const description = stripHtml(product.descriptionHtml ?? '');
  const collectionHandles = product.collections.nodes.map((c) => c.handle);
  const collectionIds = product.collections.nodes.map((c) => c.id);
  const productImages = product.images.nodes.map((i) => i.url);
  const metafields: Record<string, string> = {};
  for (const m of product.metafields.nodes) {
    metafields[`${m.namespace}.${m.key}`] = m.value;
  }

  return product.variants.nodes.map((v) => {
    const variantImage = v.image?.url ?? product.featuredImage?.url ?? productImages[0] ?? null;
    const additional = productImages.filter((u) => u !== variantImage).slice(0, 9);
    return {
      productId: product.id,
      variantId: v.id,
      handle: product.handle,
      title: product.title,
      variantTitle: v.title,
      description,
      vendor: product.vendor ?? '',
      productType: product.productType ?? '',
      tags: product.tags ?? [],
      status: product.status,
      onlineStorePublished: Boolean(product.onlineStoreUrl),
      collectionHandles,
      collectionIds,
      sku: v.sku ?? '',
      barcode: v.barcode ?? '',
      price: v.price ?? '0',
      compareAtPrice: v.compareAtPrice,
      available: v.availableForSale,
      imageUrl: variantImage,
      additionalImages: additional,
      options: normalizeOptions(v.selectedOptions),
      metafields,
      itemGroupId: product.id.split('/').pop() ?? product.id,
    } satisfies ProductView;
  });
}

export interface FetchProductsOptions {
  namespace: string;
  // Safety ceiling so a runaway catalog can't OOM the box. ~25k items.
  maxPages?: number;
}

// Pull the entire catalog as flattened ProductViews. Throws on GraphQL errors.
export async function fetchAllProducts(
  admin: AdminClient,
  { namespace, maxPages = 500 }: FetchProductsOptions,
): Promise<ProductView[]> {
  const views: ProductView[] = [];
  let cursor: string | null = null;
  let pages = 0;

  do {
    const res = await admin.graphql(PRODUCTS_QUERY, {
      variables: { cursor, namespace },
    });
    const payload = (await res.json()) as {
      data?: {
        products: {
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
          nodes: RawProduct[];
        };
      };
      errors?: { message: string }[];
    };

    if (payload.errors?.length) {
      throw new Error(`Admin API error: ${payload.errors.map((e) => e.message).join('; ')}`);
    }
    const block = payload.data?.products;
    if (!block) break;

    for (const node of block.nodes) {
      for (const view of flatten(node)) views.push(view);
    }

    cursor = block.pageInfo.hasNextPage ? block.pageInfo.endCursor : null;
    pages += 1;
  } while (cursor && pages < maxPages);

  return views;
}

export { stripHtml };
