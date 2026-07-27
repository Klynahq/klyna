import { type ActionFunctionArgs } from '@remix-run/node';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';

// GDPR mandatory webhook: customers/redact.
// Delete any rows referencing the given customer id across all models that
// store a customerId. Currently only Wishlist has a customerId field;
// dependent WishlistItem rows cascade via the Prisma relation.
export const action = async ({ request }: ActionFunctionArgs) => {
  if (!request.headers.get('x-shopify-hmac-sha256')) {
    return new Response(undefined, { status: 401, statusText: 'Unauthorized' });
  }

  const { shop, topic, payload } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  const customerId =
    payload && typeof payload === 'object' && 'customer' in payload
      ? (payload as { customer?: { id?: number | string } }).customer?.id
      : undefined;

  if (customerId !== undefined) {
    const customerGid = `gid://shopify/Customer/${customerId}`;
    await prisma.wishlist.deleteMany({
      where: { shop, customerId: { in: [String(customerId), customerGid] } },
    });
  }

  return new Response(null, { status: 200 });
};
