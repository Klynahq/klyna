// Klyna Back-in-Stock — Admin API sync.
//
// Thin wrapper over the Shopify Admin GraphQL API that keeps our VariantSnapshot
// cache fresh. Two entry points:
//   • syncWaitlistedVariants — refresh availability for every variant that has a
//     live waitlist, and flush any that flipped back in stock. Called from the
//     demand report so the merchant always sees current numbers, and as a manual
//     "check now" fallback when webhooks are unavailable (e.g. local dev).
//   • lookupVariantByInventoryItem — resolve an inventory_item_id (what the
//     inventory webhook hands us) to its variant gid, used by the webhook.
//
// `admin` is the authenticated GraphQL client from authenticate.admin/webhook.

import prisma from '../db.server';
import { flushVariant } from './waitlist.server';

// The admin client's `.graphql` returns a Response. We type it loosely on
// purpose — the cross-package generics are expensive and the queries here are
// self-describing.
type AdminGraphql = {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
};

interface VariantNode {
  id: string;
  title: string;
  price: string;
  availableForSale: boolean;
  inventoryQuantity: number | null;
  inventoryItem: { id: string } | null;
  image: { url: string } | null;
  product: { id: string; title: string; handle: string; featuredImage: { url: string } | null };
}

const VARIANTS_BY_IDS = `#graphql
  query VariantsByIds($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on ProductVariant {
        id
        title
        price
        availableForSale
        inventoryQuantity
        inventoryItem { id }
        image { url }
        product { id title handle featuredImage { url } }
      }
    }
  }`;

const VARIANT_BY_INVENTORY_ITEM = `#graphql
  query VariantByInventoryItem($id: ID!) {
    inventoryItem(id: $id) {
      id
      variant {
        id
        title
        price
        availableForSale
        inventoryQuantity
        inventoryItem { id }
        image { url }
        product { id title handle featuredImage { url } }
      }
    }
  }`;

function toSnapshotData(shop: string, v: VariantNode) {
  const available = v.inventoryQuantity ?? 0;
  return {
    shop,
    variantId: v.id,
    productId: v.product.id,
    inventoryItemId: v.inventoryItem?.id ?? null,
    productTitle: v.product.title,
    variantTitle: v.title === 'Default Title' ? null : v.title,
    productHandle: v.product.handle,
    imageUrl: v.image?.url ?? v.product.featuredImage?.url ?? null,
    price: v.price,
    available,
    inStock: v.availableForSale && available > 0,
  };
}

async function upsertSnapshot(shop: string, v: VariantNode) {
  const data = toSnapshotData(shop, v);
  await prisma.variantSnapshot.upsert({
    where: { shop_variantId: { shop, variantId: v.id } },
    update: data,
    create: data,
  });
  return data;
}

/**
 * Refresh availability for all variants with an active waitlist, persist the
 * snapshot, and flush any that are now in stock. Returns the number of variants
 * synced and total alerts sent. Chunks ID lookups to stay under Admin API limits.
 */
export async function syncWaitlistedVariants(
  admin: AdminGraphql,
  shop: string,
): Promise<{ synced: number; flushed: number; alertsSent: number }> {
  const pending = await prisma.subscription.findMany({
    where: { shop, status: 'PENDING' },
    distinct: ['variantId'],
    select: { variantId: true },
  });
  const ids = pending.map((p) => p.variantId);
  if (ids.length === 0) return { synced: 0, flushed: 0, alertsSent: 0 };

  let synced = 0;
  let flushed = 0;
  let alertsSent = 0;

  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const res = await admin.graphql(VARIANTS_BY_IDS, { variables: { ids: chunk } });
    const body = (await res.json()) as { data?: { nodes: (VariantNode | null)[] } };
    const nodes = body.data?.nodes ?? [];

    for (const node of nodes) {
      if (!node) continue;
      const data = await upsertSnapshot(shop, node);
      synced += 1;
      if (data.inStock) {
        const flush = await flushVariant(shop, node.id);
        if (flush.sent > 0) flushed += 1;
        alertsSent += flush.sent;
      }
    }
  }

  return { synced, flushed, alertsSent };
}

/**
 * Resolve an inventory_item gid to its variant, refresh the snapshot, and (if it
 * is now in stock) flush the waitlist. Returns the variant gid, or null if the
 * inventory item has no matching variant we track. Driven by the webhook.
 */
export async function syncByInventoryItem(
  admin: AdminGraphql,
  shop: string,
  inventoryItemId: string,
): Promise<{ variantId: string | null; inStock: boolean; alertsSent: number }> {
  const res = await admin.graphql(VARIANT_BY_INVENTORY_ITEM, {
    variables: { id: inventoryItemId },
  });
  const body = (await res.json()) as {
    data?: { inventoryItem?: { variant: VariantNode | null } | null };
  };
  const variant = body.data?.inventoryItem?.variant ?? null;
  if (!variant) return { variantId: null, inStock: false, alertsSent: 0 };

  const data = await upsertSnapshot(shop, variant);
  let alertsSent = 0;
  if (data.inStock) {
    const flush = await flushVariant(shop, variant.id);
    alertsSent = flush.sent;
  }
  return { variantId: variant.id, inStock: data.inStock, alertsSent };
}

/** Normalize a numeric inventory_item id from a webhook into a GraphQL gid. */
export function inventoryItemGid(id: string | number): string {
  const raw = String(id);
  return raw.startsWith('gid://') ? raw : `gid://shopify/InventoryItem/${raw}`;
}
