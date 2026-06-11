import { type ActionFunctionArgs } from '@remix-run/node';
import { authenticate } from '../shopify.server';

// GDPR / Shopify App Store mandatory webhook.
// Klyna Back-in-Stock stores only the email or phone the shopper submitted
// to the waitlist plus the variant they subscribed to - no order history,
// no profile data, no addresses. There is nothing to assemble into a data
// export here, so we just acknowledge the request.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`, JSON.stringify(payload));
  return new Response(null, { status: 200 });
};
