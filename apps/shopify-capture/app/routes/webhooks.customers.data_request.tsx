import { type ActionFunctionArgs } from '@remix-run/node';
import { authenticate } from '../shopify.server';

// GDPR mandatory webhook: customers/data_request.
// Klyna Capture stores no customer PII beyond email/phone opt-ins (Subscriber rows).
// We log the request for the merchant's compliance trail and respond 200.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`, JSON.stringify(payload));
  // No additional data export needed: Klyna Capture only stores marketing
  // opt-ins (email/phone) and conversion analytics events.
  return new Response();
};
