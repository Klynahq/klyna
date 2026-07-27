import { type ActionFunctionArgs } from '@remix-run/node';
import { authenticate } from '../shopify.server';

// GDPR mandatory webhook: customers/data_request.
// Klyna Reviews stores no customer PII beyond what the merchant ingested via
// reviews (author name/email on Review rows). We log the request and respond
// 200; the merchant fulfills the request via their admin.
export const action = async ({ request }: ActionFunctionArgs) => {
  if (!request.headers.get('x-shopify-hmac-sha256')) {
    return new Response(undefined, { status: 401, statusText: 'Unauthorized' });
  }

  const { shop, topic, payload } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`, JSON.stringify(payload));
  return new Response();
};
