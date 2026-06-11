import { type ActionFunctionArgs } from '@remix-run/node';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';

// GDPR mandatory webhook: customers/redact.
// Delete rows referencing the customer across all relevant models. Klyna Reviews
// stores customer email on Review and ReviewRequest; we redact by email match
// since we do not persist the Shopify customer id directly.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  const customer = (payload as { customer?: { email?: string } }).customer;
  const email = customer?.email;
  if (email) {
    await prisma.review.deleteMany({ where: { shop, authorEmail: email } });
    await prisma.reviewRequest.deleteMany({ where: { shop, customerEmail: email } });
  }
  return new Response();
};
