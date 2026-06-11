import { type ActionFunctionArgs } from '@remix-run/node';
import { authenticate } from '../shopify.server';

// GDPR: customers/redact
// Klyna Bundles does not persist any customer-level rows — there is no
// `customerId` column on any Prisma model in this app (see prisma/schema.prisma).
// We still acknowledge the webhook so Shopify records compliance.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop} (no customer rows to delete)`);
  return new Response();
};
