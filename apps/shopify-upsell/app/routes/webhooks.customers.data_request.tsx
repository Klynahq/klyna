import { type ActionFunctionArgs } from '@remix-run/node';
import { authenticate } from '../shopify.server';

// GDPR mandatory webhook: customers/data_request.
// HMAC is verified by authenticate.webhook(). Klyna Upsell stores no
// customer PII (only shop-scoped offer rules and aggregate event counts),
// so there is no customer data to return.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop} — no customer PII stored`);
  return new Response();
};
