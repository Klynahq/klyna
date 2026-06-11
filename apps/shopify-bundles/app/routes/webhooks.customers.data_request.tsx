import { type ActionFunctionArgs } from '@remix-run/node';
import { authenticate } from '../shopify.server';

// GDPR: customers/data_request
// Klyna stores no customer PII; we only persist Shopify session rows and
// shop-scoped configuration. There is no customer data to return.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop} (no PII stored)`);
  return new Response();
};
