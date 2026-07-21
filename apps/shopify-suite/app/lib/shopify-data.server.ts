import type { ProductKey } from './products';

type GraphqlClient = {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
};

export interface ShopSnapshot {
  shopName: string;
  myshopifyDomain: string;
  primaryDomainUrl: string;
  products: ProductSnapshot[];
  collections: ContentSnapshot[];
  pages: ContentSnapshot[];
  redirects: RedirectSnapshot[];
  discounts: DiscountSnapshot[];
  graphqlWarnings: string[];
}

export interface ProductSnapshot {
  id: string;
  title: string;
  handle: string;
  vendor?: string | null;
  productType?: string | null;
  status?: string | null;
  onlineStoreUrl?: string | null;
  description?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  imageUrl?: string | null;
  imageAlt?: string | null;
  variants: VariantSnapshot[];
}

export interface VariantSnapshot {
  id: string;
  title: string;
  sku?: string | null;
  barcode?: string | null;
  price?: string | null;
  inventoryQuantity?: number | null;
}

export interface ContentSnapshot {
  id: string;
  title: string;
  handle: string;
  onlineStoreUrl?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
}

export interface RedirectSnapshot {
  id: string;
  path: string;
  target: string;
}

export interface DiscountSnapshot {
  id: string;
  type: string;
  title: string;
  status?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  combinesWith?: {
    orderDiscounts?: boolean | null;
    productDiscounts?: boolean | null;
    shippingDiscounts?: boolean | null;
  } | null;
}

async function runGraphql<T>(
  admin: GraphqlClient,
  query: string,
  warnings: string[],
  label: string,
): Promise<T | null> {
  try {
    const response = await admin.graphql(query);
    const payload = await response.json();
    if (payload.errors) {
      warnings.push(`${label}: ${JSON.stringify(payload.errors).slice(0, 260)}`);
    }
    return (payload.data ?? null) as T | null;
  } catch (error) {
    warnings.push(`${label}: ${error instanceof Error ? error.message : 'unknown error'}`);
    return null;
  }
}

export async function getShopSnapshot(
  admin: GraphqlClient,
  productKey: ProductKey,
): Promise<ShopSnapshot> {
  const warnings: string[] = [];
  const needsContent =
    productKey === 'cleanroom' || productKey === 'redirect-guard' || productKey === 'pixel-doctor';
  const needsRedirects = productKey === 'redirect-guard';
  const needsDiscounts = productKey === 'promo-qa';
  const contentQuery = needsContent
    ? `
      collections(first: 40) {
        nodes { id title handle seo { title description } }
      }
      pages(first: 40) {
        nodes { id title handle }
      }`
    : '';
  const redirectsQuery = needsRedirects
    ? `
      urlRedirects(first: 100) {
        nodes { id path target }
      }`
    : '';
  const discountsQuery = needsDiscounts
    ? `
      discountNodes(first: 50) {
        nodes {
          id
          discount {
            __typename
            ... on DiscountAutomaticBasic {
              title
              status
              startsAt
              endsAt
              combinesWith { orderDiscounts productDiscounts shippingDiscounts }
            }
            ... on DiscountAutomaticBxgy {
              title
              status
              startsAt
              endsAt
              combinesWith { orderDiscounts productDiscounts shippingDiscounts }
            }
            ... on DiscountAutomaticFreeShipping {
              title
              status
              startsAt
              endsAt
              combinesWith { orderDiscounts productDiscounts shippingDiscounts }
            }
            ... on DiscountCodeBasic {
              title
              status
              startsAt
              endsAt
              combinesWith { orderDiscounts productDiscounts shippingDiscounts }
            }
            ... on DiscountCodeBxgy {
              title
              status
              startsAt
              endsAt
              combinesWith { orderDiscounts productDiscounts shippingDiscounts }
            }
            ... on DiscountCodeFreeShipping {
              title
              status
              startsAt
              endsAt
              combinesWith { orderDiscounts productDiscounts shippingDiscounts }
            }
          }
        }
      }`
    : '';

  const data = await runGraphql<{
    shop: {
      name: string;
      myshopifyDomain: string;
      primaryDomain: { url: string };
    };
    products?: { nodes: ProductNode[] };
    collections?: { nodes: ContentNode[] };
    pages?: { nodes: ContentNode[] };
    urlRedirects?: { nodes: RedirectSnapshot[] };
    discountNodes?: { nodes: DiscountNode[] };
  }>(
    admin,
    `{
      shop { name myshopifyDomain primaryDomain { url } }
      products(first: 60, query: "status:active") {
        nodes {
          id
          title
          handle
          vendor
          productType
          status
          onlineStoreUrl
          description
          seo { title description }
          featuredImage { url altText }
          variants(first: 30) {
            nodes { id title sku barcode price inventoryQuantity }
          }
        }
      }
      ${contentQuery}
      ${redirectsQuery}
      ${discountsQuery}
    }`,
    warnings,
    'Shop snapshot',
  );

  const shop = data?.shop ?? {
    name: 'Store',
    myshopifyDomain: 'unknown.myshopify.com',
    primaryDomain: { url: '' },
  };

  return {
    shopName: shop.name,
    myshopifyDomain: shop.myshopifyDomain,
    primaryDomainUrl: shop.primaryDomain.url,
    products: (data?.products?.nodes ?? []).map(toProduct),
    collections: (data?.collections?.nodes ?? []).map((node) =>
      toContent(node, collectionUrl(shop.primaryDomain.url, node.handle)),
    ),
    pages: (data?.pages?.nodes ?? []).map((node) =>
      toContent(node, pageUrl(shop.primaryDomain.url, node.handle)),
    ),
    redirects: data?.urlRedirects?.nodes ?? [],
    discounts: (data?.discountNodes?.nodes ?? [])
      .map(toDiscount)
      .filter(Boolean) as DiscountSnapshot[],
    graphqlWarnings: warnings,
  };
}

type ProductNode = {
  id: string;
  title: string;
  handle: string;
  vendor?: string | null;
  productType?: string | null;
  status?: string | null;
  onlineStoreUrl?: string | null;
  description?: string | null;
  seo?: { title?: string | null; description?: string | null } | null;
  featuredImage?: { url?: string | null; altText?: string | null } | null;
  variants?: { nodes: VariantSnapshot[] };
};

type ContentNode = {
  id: string;
  title: string;
  handle: string;
  onlineStoreUrl?: string | null;
  seo?: { title?: string | null; description?: string | null } | null;
};

type DiscountNode = {
  id: string;
  discount?: {
    __typename: string;
    title?: string | null;
    status?: string | null;
    startsAt?: string | null;
    endsAt?: string | null;
    combinesWith?: DiscountSnapshot['combinesWith'];
  } | null;
};

function toProduct(node: ProductNode): ProductSnapshot {
  return {
    id: node.id,
    title: node.title,
    handle: node.handle,
    vendor: node.vendor,
    productType: node.productType,
    status: node.status,
    onlineStoreUrl: node.onlineStoreUrl,
    description: node.description,
    seoTitle: node.seo?.title,
    seoDescription: node.seo?.description,
    imageUrl: node.featuredImage?.url,
    imageAlt: node.featuredImage?.altText,
    variants: node.variants?.nodes ?? [],
  };
}

function toContent(node: ContentNode, fallbackUrl?: string): ContentSnapshot {
  return {
    id: node.id,
    title: node.title,
    handle: node.handle,
    onlineStoreUrl: node.onlineStoreUrl ?? fallbackUrl,
    seoTitle: node.seo?.title,
    seoDescription: node.seo?.description,
  };
}

function collectionUrl(primaryDomainUrl: string, handle: string) {
  return `${primaryDomainUrl.replace(/\/$/, '')}/collections/${handle}`;
}

function pageUrl(primaryDomainUrl: string, handle: string) {
  return `${primaryDomainUrl.replace(/\/$/, '')}/pages/${handle}`;
}

function toDiscount(node: DiscountNode): DiscountSnapshot | null {
  if (!node.discount) return null;
  return {
    id: node.id,
    type: node.discount.__typename,
    title: node.discount.title ?? 'Untitled discount',
    status: node.discount.status,
    startsAt: node.discount.startsAt,
    endsAt: node.discount.endsAt,
    combinesWith: node.discount.combinesWith,
  };
}
