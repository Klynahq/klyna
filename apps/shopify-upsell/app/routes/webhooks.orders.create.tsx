import { type ActionFunctionArgs } from '@remix-run/node';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';

// orders/create — confirm and attribute accepted upsells.
//
// The storefront widget logs an `accept` event the moment a shopper adds the
// recommended product. That is optimistic: the order may never be placed. When
// the order actually lands we reconcile — find recent accepted events for this
// shop whose upsold product GID is present in the order's line items, stamp
// them with the order GID, and record the line revenue. Everything else the
// dashboard treats as an abandoned accept.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  const order = payload as {
    admin_graphql_api_id?: string;
    line_items?: Array<{
      product_id?: number | string;
      price?: string;
      quantity?: number;
    }>;
  };

  const orderGid = order.admin_graphql_api_id ?? null;
  const lineItems = order.line_items ?? [];
  if (!orderGid || lineItems.length === 0) {
    return new Response();
  }

  // Index the order's product GIDs → line revenue (minor units).
  const revenueByProduct = new Map<string, number>();
  for (const li of lineItems) {
    if (li.product_id == null) continue;
    const gid = `gid://shopify/Product/${li.product_id}`;
    const price = Math.round(parseFloat(li.price ?? '0') * 100);
    const qty = li.quantity ?? 1;
    revenueByProduct.set(gid, (revenueByProduct.get(gid) ?? 0) + price * qty);
  }

  // Reconcile accepted-but-unattributed events from the last 24h.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const pending = await prisma.offerEvent.findMany({
    where: { shop, type: 'accept', orderGid: null, createdAt: { gte: since } },
    include: { variant: true },
    orderBy: { createdAt: 'desc' },
  });

  for (const ev of pending) {
    const revenue = revenueByProduct.get(ev.variant.productGid);
    if (revenue == null) continue;
    await prisma.offerEvent.update({
      where: { id: ev.id },
      data: { orderGid, revenue },
    });
    // One accept per order line — avoid double-attributing the same line.
    revenueByProduct.delete(ev.variant.productGid);
  }

  return new Response();
};
