import { type ActionFunctionArgs } from '@remix-run/node';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';

// GDPR mandatory webhook: customers/redact.
// Delete all rows referencing the given customerId across every model that
// holds a customerId field.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  console.log(`[GDPR] ${topic} received for ${shop}`);

  const customer = (payload as { customer?: { id?: number | string } } | undefined)?.customer;
  const rawId = customer?.id;
  if (rawId === undefined || rawId === null) {
    return new Response();
  }
  const customerGid = `gid://shopify/Customer/${rawId}`;

  // Members carry the Shopify customer GID. Cascade rules delete the member's
  // ledger entries, redemptions, and referrals automatically.
  await prisma.member.deleteMany({
    where: { shop, customerId: { in: [String(rawId), customerGid] } },
  });

  return new Response();
};
