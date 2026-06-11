import { type ActionFunctionArgs } from '@remix-run/node';
import { authenticate } from '../shopify.server';

// GDPR: customers/data_request. Shopify HMAC is verified by authenticate.webhook.
// Klyna Urgency stores no customer PII (orders are reduced to first name + city
// for social-proof and contain no addresses, emails, or payment data), so there
// is no per-customer data to export. We log the request for compliance audit.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  const customerId =
    (payload as { customer?: { id?: number | string } } | undefined)?.customer?.id ?? 'unknown';
  console.log(`[GDPR] ${topic} for ${shop} customer=${String(customerId)} — no PII stored`);
  return new Response();
};
