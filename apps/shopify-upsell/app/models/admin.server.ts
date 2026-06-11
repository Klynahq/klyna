// Klyna Upsell — Shopify Admin GraphQL helpers.
//
// Thin wrappers around `authenticate.admin(request).admin.graphql` that the
// offer editor uses to populate product/collection pickers and to resolve a
// product GID into the title + image we cache on the variant row.

export interface AdminProduct {
  gid: string;
  handle: string;
  title: string;
  image: string | null;
  price: string | null;
}

export interface AdminCollection {
  gid: string;
  title: string;
}

// `admin` is the typed graphql client returned by authenticate.admin(). We keep
// it `any` at the boundary (same pattern the reference app uses for cross-package
// Shopify types) and narrow the response shapes ourselves below.
type AdminGraphql = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

const PRODUCTS_QUERY = `#graphql
  query KlynaProducts($query: String) {
    products(first: 50, query: $query, sortKey: TITLE) {
      nodes {
        id
        handle
        title
        featuredImage { url }
        priceRangeV2 { minVariantPrice { amount } }
      }
    }
  }`;

const COLLECTIONS_QUERY = `#graphql
  query KlynaCollections {
    collections(first: 50, sortKey: TITLE) {
      nodes { id title }
    }
  }`;

const PRODUCT_BY_ID_QUERY = `#graphql
  query KlynaProduct($id: ID!) {
    product(id: $id) {
      id
      handle
      title
      featuredImage { url }
      priceRangeV2 { minVariantPrice { amount } }
    }
  }`;

interface ProductNode {
  id: string;
  handle: string;
  title: string;
  featuredImage: { url: string } | null;
  priceRangeV2: { minVariantPrice: { amount: string } } | null;
}

function toProduct(node: ProductNode): AdminProduct {
  return {
    gid: node.id,
    handle: node.handle,
    title: node.title,
    image: node.featuredImage?.url ?? null,
    price: node.priceRangeV2?.minVariantPrice.amount ?? null,
  };
}

export async function listProducts(
  admin: AdminGraphql,
  search?: string,
): Promise<AdminProduct[]> {
  const res = await admin.graphql(PRODUCTS_QUERY, {
    variables: { query: search ? `title:*${search}*` : null },
  });
  const body = (await res.json()) as { data?: { products?: { nodes: ProductNode[] } } };
  return (body.data?.products?.nodes ?? []).map(toProduct);
}

export async function listCollections(admin: AdminGraphql): Promise<AdminCollection[]> {
  const res = await admin.graphql(COLLECTIONS_QUERY);
  const body = (await res.json()) as {
    data?: { collections?: { nodes: Array<{ id: string; title: string }> } };
  };
  return (body.data?.collections?.nodes ?? []).map((n) => ({ gid: n.id, title: n.title }));
}

// Resolve a single product GID into its title / image / price. Used when an
// offer is saved so the variant carries a snapshot the storefront can render
// without a second round-trip.
export async function getProduct(
  admin: AdminGraphql,
  gid: string,
): Promise<AdminProduct | null> {
  const res = await admin.graphql(PRODUCT_BY_ID_QUERY, { variables: { id: gid } });
  const body = (await res.json()) as { data?: { product?: ProductNode | null } };
  return body.data?.product ? toProduct(body.data.product) : null;
}
