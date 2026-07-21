import type { ActionFunctionArgs } from '@remix-run/node';
import { authenticate } from '../shopify.server';

// GDPR mandatory webhook: customers/data_request.
// Klyna SEO stores no customer PII — we only persist Shopify sessions,
// audit results keyed by shop URL, and AI settings/cache. There is no
// customer-scoped data to return. We log the request for audit and 200.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  console.log(
    `[GDPR] ${topic} for ${shop}: no customer PII stored. payload=`,
    JSON.stringify(payload),
  );
  return new Response(null, { status: 200 });
};
