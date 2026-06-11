import { type ActionFunctionArgs } from '@remix-run/node';
import { authenticate } from '../shopify.server';

// GDPR mandatory webhook: customers/data_request.
// Klyna Feed stores no customer PII (only product feed data + Shopify session
// records keyed by shop). There is nothing to return, so we log and ack 200.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`, {
    customerId: (payload as { customer?: { id?: number } } | undefined)?.customer?.id,
  });
  return new Response();
};
