import { type ActionFunctionArgs } from '@remix-run/node';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';
import { makeRequestToken } from '../lib/reviews.server';

interface FulfilledOrderPayload {
  id?: number;
  admin_graphql_api_id?: string;
  email?: string | null;
  customer?: { first_name?: string | null; last_name?: string | null } | null;
  fulfillments?: { created_at?: string }[];
  line_items?: {
    title?: string;
    product_id?: number | null;
    admin_graphql_api_id?: string;
  }[];
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  const order = payload as FulfilledOrderPayload;
  const email = order.email;
  if (!email) {
    return new Response();
  }

  // Honor the per-shop automation toggle + delay.
  const settings = await prisma.settings.findUnique({ where: { shop } });
  if (settings && settings.requestEnabled === false) {
    return new Response();
  }
  const delayDays = settings?.requestDelayDays ?? 7;

  const orderId =
    order.admin_graphql_api_id ??
    (order.id ? `gid://shopify/Order/${order.id}` : null);
  if (!orderId) {
    return new Response();
  }

  const fulfilledAt = order.fulfillments?.[0]?.created_at
    ? new Date(order.fulfillments[0].created_at)
    : new Date();
  const scheduledFor = new Date(fulfilledAt.getTime() + delayDays * 24 * 60 * 60 * 1000);
  const customerName =
    [order.customer?.first_name, order.customer?.last_name].filter(Boolean).join(' ') || null;

  for (const item of order.line_items ?? []) {
    const productId =
      item.admin_graphql_api_id ??
      (item.product_id ? `gid://shopify/Product/${item.product_id}` : null);
    if (!productId) continue;

    try {
      await prisma.reviewRequest.create({
        data: {
          shop,
          orderId,
          productId,
          productTitle: item.title ?? 'Product',
          customerEmail: email,
          customerName,
          token: makeRequestToken(),
          status: 'scheduled',
          scheduledFor,
        },
      });
    } catch {
      // Unique (shop, orderId, productId): request already exists, skip.
    }
  }

  return new Response();
};
