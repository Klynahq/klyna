import { type ActionFunctionArgs } from '@remix-run/node';
import { authenticate } from '../shopify.server';

// GDPR mandatory webhook: customers/data_request.
// Klyna Wishlist stores no customer PII beyond a Shopify customer GID used
// as a foreign key on Wishlist rows. We log the request for audit purposes
// and return 200; the merchant can export the customer GID-keyed rows
// directly from the admin if needed.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`, JSON.stringify(payload));
  return new Response(null, { status: 200 });
};
