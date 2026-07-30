import { type ActionFunctionArgs } from '@remix-run/node';
import { authenticate } from '../shopify.server';

// Shopify sends this verified webhook when a customer requests their data.
// Waitlist records are already available to the merchant in Subscribers and
// its CSV export. Acknowledge the request without copying customer identifiers
// into application logs.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);
  return new Response(null, { status: 200 });
};
