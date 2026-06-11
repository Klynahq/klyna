import { type ActionFunctionArgs } from '@remix-run/node';
import { authenticate } from '../shopify.server';

// GDPR mandatory webhook: customers/data_request.
// Klyna Rewards stores no customer PII beyond Shopify customer GID and the
// shop-supplied email/displayName for loyalty bookkeeping. There is nothing
// additional to export. We acknowledge the request with a 200.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`[GDPR] ${topic} received for ${shop}`);
  return new Response();
};
