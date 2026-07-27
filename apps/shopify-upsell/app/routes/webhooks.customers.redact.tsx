import { type ActionFunctionArgs } from '@remix-run/node';
import { authenticate } from '../shopify.server';

// GDPR mandatory webhook: customers/redact.
// HMAC is verified by authenticate.webhook(). No Prisma models in this app
// reference a customer id (no customerId fields), so there is nothing to
// delete. Respond 200 to acknowledge.
export const action = async ({ request }: ActionFunctionArgs) => {
  if (!request.headers.get('x-shopify-hmac-sha256')) {
    return new Response(undefined, { status: 401, statusText: 'Unauthorized' });
  }

  const { shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop} — no customer rows to delete`);
  return new Response();
};
