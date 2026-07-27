import { type ActionFunctionArgs } from '@remix-run/node';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';

// GDPR mandatory webhook: customers/redact.
// Delete all Subscriber rows for this shop+customer.
export const action = async ({ request }: ActionFunctionArgs) => {
  if (!request.headers.get('x-shopify-hmac-sha256')) {
    return new Response(undefined, { status: 401, statusText: 'Unauthorized' });
  }

  const { shop, topic, payload } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  const body = payload as {
    customer?: { id?: number | string; email?: string; phone?: string };
  };
  const customer = body.customer ?? {};
  const customerGid = customer.id
    ? `gid://shopify/Customer/${customer.id}`
    : undefined;
  const email = customer.email ?? undefined;
  const phone = customer.phone ?? undefined;

  // Subscriber is the only model storing customer PII.
  await prisma.subscriber.deleteMany({
    where: {
      shop,
      OR: [
        ...(customerGid ? [{ shopifyCustomerId: customerGid }] : []),
        ...(email ? [{ email }] : []),
        ...(phone ? [{ phone }] : []),
      ],
    },
  });

  return new Response();
};
