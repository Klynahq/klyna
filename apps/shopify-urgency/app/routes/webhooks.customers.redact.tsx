import { type ActionFunctionArgs } from '@remix-run/node';
import { authenticate } from '../shopify.server';

// GDPR: customers/redact. Klyna Urgency does not store any model keyed on a
// Shopify customer id, so there is nothing to delete per-customer. We still
// verify HMAC, log the request, and respond 200 to satisfy the contract.
export const action = async ({ request }: ActionFunctionArgs) => {
  if (!request.headers.get('x-shopify-hmac-sha256')) {
    return new Response(undefined, { status: 401, statusText: 'Unauthorized' });
  }

  const { shop, topic, payload } = await authenticate.webhook(request);
  const customerId =
    (payload as { customer?: { id?: number | string } } | undefined)?.customer?.id ?? 'unknown';
  console.log(`[GDPR] ${topic} for ${shop} customer=${String(customerId)} — no rows to redact`);
  return new Response();
};
