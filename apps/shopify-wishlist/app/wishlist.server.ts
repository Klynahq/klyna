// Klyna Wishlist — server-side wishlist helpers.
//
// Shared between the embedded admin routes (reports, dashboard) and the
// storefront App Proxy routes (save/remove/view). Keeping the Prisma access
// here means the GraphQL product-resolution shape and the analytics rollups
// are defined once and reused everywhere.

import prisma from './db.server';

export type SavedProduct = {
  id: string; // Shopify product GID
  title: string;
  handle: string;
  imageUrl: string | null;
  price: string | null;
  currency: string | null;
};

// Admin GraphQL query used to hydrate a batch of product GIDs into the
// denormalized snapshot we persist on each WishlistItem.
export const PRODUCTS_BY_IDS_QUERY = `#graphql
  query WishlistProducts($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Product {
        id
        title
        handle
        featuredImage { url altText }
        priceRangeV2 { minVariantPrice { amount currencyCode } }
      }
    }
  }
`;

type GraphqlNode = {
  id: string;
  title: string;
  handle: string;
  featuredImage: { url: string | null } | null;
  priceRangeV2: { minVariantPrice: { amount: string; currencyCode: string } } | null;
};

// `admin.graphql` is the function returned by authenticate.admin / .public.
// It is typed loosely on purpose (see shopify.server.ts) so we accept any.
export async function resolveProducts(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  graphql: (query: string, opts?: any) => Promise<Response>,
  ids: string[],
): Promise<Map<string, SavedProduct>> {
  const out = new Map<string, SavedProduct>();
  if (ids.length === 0) return out;

  const res = await graphql(PRODUCTS_BY_IDS_QUERY, { variables: { ids } });
  const body = (await res.json()) as { data?: { nodes?: (GraphqlNode | null)[] } };
  for (const node of body.data?.nodes ?? []) {
    if (!node || !node.id) continue;
    out.set(node.id, {
      id: node.id,
      title: node.title,
      handle: node.handle,
      imageUrl: node.featuredImage?.url ?? null,
      price: node.priceRangeV2?.minVariantPrice.amount ?? null,
      currency: node.priceRangeV2?.minVariantPrice.currencyCode ?? null,
    });
  }
  return out;
}

// Mint a short, URL-safe, unguessable token for shareable wishlist links.
export function makeShareToken(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 12; i += 1) {
    token += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return token;
}

// Find or create the wishlist for a shopper. A shopper is keyed by customerId
// (logged in) when present, otherwise by their guest browser id.
export async function findOrCreateWishlist(opts: {
  shop: string;
  customerId?: string | null;
  guestId?: string | null;
}) {
  const { shop, customerId, guestId } = opts;

  const existing = await prisma.wishlist.findFirst({
    where: customerId
      ? { shop, customerId }
      : { shop, guestId: guestId ?? '__none__' },
    include: { items: { orderBy: { createdAt: 'desc' } } },
  });
  if (existing) return existing;

  return prisma.wishlist.create({
    data: {
      shop,
      token: makeShareToken(),
      customerId: customerId ?? null,
      guestId: customerId ? null : guestId ?? null,
    },
    include: { items: { orderBy: { createdAt: 'desc' } } },
  });
}

// Record an analytics event. Best-effort — never throws into the request path.
export async function recordEvent(opts: {
  shop: string;
  type: 'add' | 'remove' | 'share' | 'view' | 'add_to_cart';
  productId?: string | null;
  wishlistId?: string | null;
}) {
  try {
    await prisma.wishlistEvent.create({
      data: {
        shop: opts.shop,
        type: opts.type,
        productId: opts.productId ?? null,
        wishlistId: opts.wishlistId ?? null,
      },
    });
  } catch (err) {
    console.error('recordEvent failed', err);
  }
}

export type MostWishlisted = {
  productId: string;
  saves: number;
  title: string;
  handle: string;
  imageUrl: string | null;
  price: string | null;
  currency: string | null;
};

// Aggregate the most-wishlisted products across all live wishlist items for a
// shop. Returns a ranked list with the denormalized snapshot already attached.
export async function mostWishlisted(shop: string, take = 20): Promise<MostWishlisted[]> {
  const grouped = await prisma.wishlistItem.groupBy({
    by: ['productId'],
    where: { shop },
    _count: { productId: true },
    orderBy: { _count: { productId: 'desc' } },
    take,
  });
  if (grouped.length === 0) return [];

  // Pull one representative snapshot row per product for display fields.
  const snapshots = await prisma.wishlistItem.findMany({
    where: { shop, productId: { in: grouped.map((g) => g.productId) } },
    distinct: ['productId'],
    orderBy: { createdAt: 'desc' },
  });
  const byId = new Map(snapshots.map((s) => [s.productId, s]));

  return grouped.map((g) => {
    const snap = byId.get(g.productId);
    return {
      productId: g.productId,
      saves: g._count.productId,
      title: snap?.productTitle ?? g.productId,
      handle: snap?.productHandle ?? '',
      imageUrl: snap?.imageUrl ?? null,
      price: snap?.price ?? null,
      currency: snap?.currency ?? null,
    };
  });
}
