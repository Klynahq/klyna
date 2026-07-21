import type { ActionFunctionArgs } from '@remix-run/node';
import { authenticate } from '../shopify.server';

// GDPR mandatory webhook: customers/redact.
// Klyna SEO does not store rows keyed by Shopify customerId — no model
// currently has a customerId column. Logged for compliance audit and 200.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  console.log(
    `[GDPR] ${topic} for ${shop}: no customer-scoped rows to delete. payload=`,
    JSON.stringify(payload),
  );
  return new Response(null, { status: 200 });
};
