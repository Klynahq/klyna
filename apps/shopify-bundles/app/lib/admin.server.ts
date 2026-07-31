// Klyna Bundles — Shopify Admin GraphQL helpers.
//
// Thin wrappers over the authenticated `admin.graphql` client returned by
// `authenticate.admin(request)`. Each function returns plain, already-shaped
// data so the route loaders/actions stay declarative. The `admin` argument is
// typed loosely (`AdminClient`) to avoid pulling the heavy generated types
// across the package boundary — the same pattern the reference app uses for
// its shopify.server re-exports.

export interface AdminClient {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
}

export interface CatalogProduct {
  gid: string;
  title: string;
  handle: string;
  imageUrl: string | null;
  price: number;
  variantGid: string | null;
}

/** Run a GraphQL operation and return the parsed `data` (throws on userErrors). */
async function gql<T>(
  admin: AdminClient,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const res = await admin.graphql(query, variables ? { variables } : undefined);
  const body = (await res.json()) as { data?: T; errors?: unknown };
  if (body.errors) {
    throw new Error(`Shopify GraphQL error: ${JSON.stringify(body.errors)}`);
  }
  return body.data as T;
}

const PRODUCT_FIELDS = `
  id
  title
  handle
  featuredImage { url }
  priceRangeV2 { minVariantPrice { amount currencyCode } }
  variants(first: 1) { nodes { id } }
`;

interface ProductNode {
  id: string;
  title: string;
  handle: string;
  featuredImage: { url: string } | null;
  priceRangeV2: { minVariantPrice: { amount: string; currencyCode: string } };
  variants: { nodes: { id: string }[] };
}

function toCatalogProduct(n: ProductNode): CatalogProduct {
  return {
    gid: n.id,
    title: n.title,
    handle: n.handle,
    imageUrl: n.featuredImage?.url ?? null,
    price: Number(n.priceRangeV2.minVariantPrice.amount),
    variantGid: n.variants.nodes[0]?.id ?? null,
  };
}

/** Search the catalog for the bundle builder picker. */
export async function searchProducts(
  admin: AdminClient,
  query: string,
  first = 25,
): Promise<CatalogProduct[]> {
  const data = await gql<{ products: { nodes: ProductNode[] } }>(
    admin,
    `#graphql
      query SearchProducts($query: String!, $first: Int!) {
        products(first: $first, query: $query, sortKey: RELEVANCE) {
          nodes { ${PRODUCT_FIELDS} }
        }
      }`,
    { query: query ? `title:*${query}* OR sku:*${query}*` : '', first },
  );
  return data.products.nodes.map(toCatalogProduct);
}

/** Fetch a single product by GID (used when hydrating a saved bundle). */
export async function getProduct(admin: AdminClient, gid: string): Promise<CatalogProduct | null> {
  const data = await gql<{ product: ProductNode | null }>(
    admin,
    `#graphql
      query GetProduct($id: ID!) {
        product(id: $id) { ${PRODUCT_FIELDS} }
      }`,
    { id: gid },
  );
  return data.product ? toCatalogProduct(data.product) : null;
}

export interface ShopInfo {
  name: string;
  currencyCode: string;
  myshopifyDomain: string;
}

export async function getShopInfo(admin: AdminClient): Promise<ShopInfo> {
  const data = await gql<{ shop: ShopInfo }>(
    admin,
    `#graphql
      query ShopInfo {
        shop { name currencyCode myshopifyDomain }
      }`,
  );
  return data.shop;
}

export interface OrderLine {
  orderGid: string;
  productGids: string[];
}

/**
 * Page through recent orders and return each order's distinct product GIDs.
 * Capped at `maxOrders` so a single recompute never runs unbounded on a large
 * store — more than enough signal for FBT on a typical catalog.
 */
export async function fetchRecentOrderBaskets(
  admin: AdminClient,
  maxOrders = 250,
): Promise<{ baskets: OrderLine[]; products: Map<string, CatalogProduct> }> {
  const baskets: OrderLine[] = [];
  const products = new Map<string, CatalogProduct>();
  let cursor: string | null = null;

  while (baskets.length < maxOrders) {
    const pageSize = Math.min(50, maxOrders - baskets.length);
    const data: {
      orders: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: {
          id: string;
          lineItems: {
            nodes: {
              product: {
                id: string;
                title: string;
                handle: string;
                featuredImage: { url: string } | null;
                priceRangeV2: { minVariantPrice: { amount: string } };
              } | null;
            }[];
          };
        }[];
      };
    } = await gql(
      admin,
      `#graphql
        query OrderBaskets($first: Int!, $after: String) {
          orders(first: $first, after: $after, sortKey: CREATED_AT, reverse: true) {
            pageInfo { hasNextPage endCursor }
            nodes {
              id
              lineItems(first: 50) {
                nodes {
                  product {
                    id
                    title
                    handle
                    featuredImage { url }
                    priceRangeV2 { minVariantPrice { amount } }
                  }
                }
              }
            }
          }
        }`,
      { first: pageSize, after: cursor },
    );

    for (const order of data.orders.nodes) {
      const gids = new Set<string>();
      for (const li of order.lineItems.nodes) {
        const p = li.product;
        if (!p) continue;
        gids.add(p.id);
        if (!products.has(p.id)) {
          products.set(p.id, {
            gid: p.id,
            title: p.title,
            handle: p.handle,
            imageUrl: p.featuredImage?.url ?? null,
            price: Number(p.priceRangeV2.minVariantPrice.amount),
            variantGid: null,
          });
        }
      }
      if (gids.size > 0) {
        baskets.push({ orderGid: order.id, productGids: [...gids] });
      }
    }

    if (!data.orders.pageInfo.hasNextPage) break;
    cursor = data.orders.pageInfo.endCursor;
  }

  return { baskets, products };
}

export interface AutomaticDiscountInput {
  title: string;
  /** Percentage (0–1, e.g. 0.1 = 10%) or null when using a fixed amount. */
  percentage: number | null;
  /** Fixed amount off in major currency units, or null when using percentage. */
  amount: number | null;
  /** Product GIDs the discount applies to. Empty = all products. */
  productGids: string[];
  /** Minimum quantity that triggers the discount (volume break). */
  minQuantity: number;
}

export interface AutomaticDiscountRecord {
  id: string;
  title: string;
  status: 'ACTIVE' | 'EXPIRED' | 'SCHEDULED';
}

function automaticDiscountInput(input: AutomaticDiscountInput): Record<string, unknown> {
  const customerGets: Record<string, unknown> = {
    value:
      input.percentage != null
        ? { percentage: input.percentage }
        : { discountAmount: { amount: input.amount ?? 0, appliesOnEachItem: true } },
    items:
      input.productGids.length > 0
        ? { products: { productsToAdd: input.productGids } }
        : { all: true },
  };

  return {
    title: input.title,
    startsAt: new Date().toISOString(),
    endsAt: null,
    minimumRequirement: {
      quantity: { greaterThanOrEqualToQuantity: String(Math.max(1, input.minQuantity)) },
    },
    customerGets,
  };
}

function assertDiscountMutation(
  operation: string,
  result: { userErrors: { message: string }[] },
): void {
  if (result.userErrors.length > 0) {
    throw new Error(
      `${operation} failed: ${result.userErrors.map((error) => error.message).join('; ')}`,
    );
  }
}

/**
 * Create a native Shopify automatic discount (basic / order) so the savings a
 * bundle or volume tier promises are actually enforced at checkout. Returns the
 * created discount's GID. Uses `discountAutomaticBasicCreate`, which applies to
 * the whole cart subject to the item/quantity constraints we pass.
 */
export async function createAutomaticDiscount(
  admin: AdminClient,
  input: AutomaticDiscountInput,
): Promise<string> {
  const data = await gql<{
    discountAutomaticBasicCreate: {
      automaticDiscountNode: { id: string } | null;
      userErrors: { field: string[]; message: string }[];
    };
  }>(
    admin,
    `#graphql
      mutation CreateAutoDiscount($discount: DiscountAutomaticBasicInput!) {
        discountAutomaticBasicCreate(automaticBasicDiscount: $discount) {
          automaticDiscountNode { id }
          userErrors { field message }
        }
    }`,
    {
      discount: automaticDiscountInput(input),
    },
  );

  const result = data.discountAutomaticBasicCreate;
  assertDiscountMutation('Discount create', result);
  const gid = result.automaticDiscountNode?.id;
  if (!gid) throw new Error('Discount create returned no node.');
  return gid;
}

/** Fetch one app-managed automatic discount and its current checkout state. */
export async function getAutomaticDiscount(
  admin: AdminClient,
  id: string,
): Promise<AutomaticDiscountRecord | null> {
  const data = await gql<{
    automaticDiscountNode: {
      id: string;
      automaticDiscount: { title?: string; status?: AutomaticDiscountRecord['status'] };
    } | null;
  }>(
    admin,
    `#graphql
      query AutomaticDiscount($id: ID!) {
        automaticDiscountNode(id: $id) {
          id
          automaticDiscount {
            ... on DiscountAutomaticBasic {
              title
              status
            }
          }
        }
      }`,
    { id },
  );

  const node = data.automaticDiscountNode;
  const title = node?.automaticDiscount.title;
  const status = node?.automaticDiscount.status;
  return node && title && status ? { id: node.id, title, status } : null;
}

/**
 * Find exact-title automatic basic discounts. This repairs records created
 * before Klyna started persisting Shopify discount IDs.
 */
export async function findAutomaticDiscountsByTitle(
  admin: AdminClient,
  title: string,
): Promise<AutomaticDiscountRecord[]> {
  type DiscountPage = {
    automaticDiscountNodes: {
      nodes: {
        id: string;
        automaticDiscount: { title?: string; status?: AutomaticDiscountRecord['status'] };
      }[];
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  };

  const matches: AutomaticDiscountRecord[] = [];
  let after: string | null = null;

  // Search with a plain stable term and compare titles in code. Shopify search
  // syntax treats characters such as the "+" in "2+" as operators.
  for (let page = 0; page < 20; page += 1) {
    const data: DiscountPage = await gql(
      admin,
      `#graphql
        query AutomaticDiscountsByTitle($query: String!, $after: String) {
          automaticDiscountNodes(first: 250, after: $after, query: $query) {
            nodes {
              id
              automaticDiscount {
                ... on DiscountAutomaticBasic {
                  title
                  status
                }
              }
            }
            pageInfo { hasNextPage endCursor }
          }
        }`,
      { query: title.includes('Klyna') ? 'Klyna' : title.split(/\s+/)[0] || title, after },
    );

    for (const node of data.automaticDiscountNodes.nodes) {
      const nodeTitle = node.automaticDiscount.title;
      const status = node.automaticDiscount.status;
      if (nodeTitle === title && status) {
        matches.push({ id: node.id, title: nodeTitle, status });
      }
    }

    if (!data.automaticDiscountNodes.pageInfo.hasNextPage) break;
    after = data.automaticDiscountNodes.pageInfo.endCursor;
  }

  return matches;
}

/** Replace the rules of an existing automatic basic discount. */
export async function updateAutomaticDiscount(
  admin: AdminClient,
  id: string,
  input: AutomaticDiscountInput,
): Promise<void> {
  const data = await gql<{
    discountAutomaticBasicUpdate: {
      automaticDiscountNode: { id: string } | null;
      userErrors: { message: string }[];
    };
  }>(
    admin,
    `#graphql
      mutation UpdateAutoDiscount($id: ID!, $discount: DiscountAutomaticBasicInput!) {
        discountAutomaticBasicUpdate(id: $id, automaticBasicDiscount: $discount) {
          automaticDiscountNode { id }
          userErrors { field message }
        }
      }`,
    { id, discount: automaticDiscountInput(input) },
  );

  assertDiscountMutation('Discount update', data.discountAutomaticBasicUpdate);
}

export async function activateAutomaticDiscount(admin: AdminClient, id: string): Promise<void> {
  const data = await gql<{
    discountAutomaticActivate: { userErrors: { message: string }[] };
  }>(
    admin,
    `#graphql
      mutation ActivateAutoDiscount($id: ID!) {
        discountAutomaticActivate(id: $id) {
          automaticDiscountNode { id }
          userErrors { field message }
        }
      }`,
    { id },
  );
  assertDiscountMutation('Discount activation', data.discountAutomaticActivate);
}

export async function deactivateAutomaticDiscount(admin: AdminClient, id: string): Promise<void> {
  const data = await gql<{
    discountAutomaticDeactivate: { userErrors: { message: string }[] };
  }>(
    admin,
    `#graphql
      mutation DeactivateAutoDiscount($id: ID!) {
        discountAutomaticDeactivate(id: $id) {
          automaticDiscountNode { id }
          userErrors { field message }
        }
      }`,
    { id },
  );
  assertDiscountMutation('Discount deactivation', data.discountAutomaticDeactivate);
}

export async function deleteAutomaticDiscount(admin: AdminClient, id: string): Promise<void> {
  const data = await gql<{
    discountAutomaticDelete: {
      deletedAutomaticDiscountId: string | null;
      userErrors: { message: string }[];
    };
  }>(
    admin,
    `#graphql
      mutation DeleteAutoDiscount($id: ID!) {
        discountAutomaticDelete(id: $id) {
          deletedAutomaticDiscountId
          userErrors { field message }
        }
      }`,
    { id },
  );
  assertDiscountMutation('Discount deletion', data.discountAutomaticDelete);
}

export interface SyncAutomaticDiscountInput {
  discountGid: string | null;
  previousTitle: string;
  active: boolean;
  discount: AutomaticDiscountInput;
}

/**
 * Keep one Klyna record and one Shopify checkout discount in lockstep. Exact
 * title lookup also adopts and deduplicates legacy discounts from older builds.
 */
export async function syncAutomaticDiscount(
  admin: AdminClient,
  input: SyncAutomaticDiscountInput,
): Promise<string | null> {
  const titleMatches = await findAutomaticDiscountsByTitle(admin, input.previousTitle);
  let current = input.discountGid ? await getAutomaticDiscount(admin, input.discountGid) : null;
  current ??= titleMatches[0] ?? null;

  for (const duplicate of titleMatches) {
    if (duplicate.id !== current?.id) await deleteAutomaticDiscount(admin, duplicate.id);
  }

  if (!input.active) {
    if (current && current.status !== 'EXPIRED') {
      await deactivateAutomaticDiscount(admin, current.id);
    }
    return current?.id ?? null;
  }

  if (!current) return createAutomaticDiscount(admin, input.discount);

  await updateAutomaticDiscount(admin, current.id, input.discount);
  const refreshed = await getAutomaticDiscount(admin, current.id);
  if (refreshed?.status !== 'ACTIVE') {
    await activateAutomaticDiscount(admin, current.id);
  }
  return current.id;
}

/** Delete every matching Klyna-owned discount, including pre-ID legacy rows. */
export async function removeAutomaticDiscount(
  admin: AdminClient,
  discountGid: string | null,
  title: string,
): Promise<void> {
  const ids = new Set<string>();
  if (discountGid && (await getAutomaticDiscount(admin, discountGid))) ids.add(discountGid);
  for (const match of await findAutomaticDiscountsByTitle(admin, title)) ids.add(match.id);
  for (const id of ids) await deleteAutomaticDiscount(admin, id);
}
