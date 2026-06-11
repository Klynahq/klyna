import { type ActionFunctionArgs } from '@remix-run/node';
import { authenticate } from '../shopify.server';

// GDPR mandatory webhook: customers/redact.
// Klyna Feed does not persist any customer-scoped rows (no model has a
// customerId field). We log and ack 200. If a customerId field is ever added
// to a model, add the corresponding deleteMany here.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`, {
    customerId: (payload as { customer?: { id?: number } } | undefined)?.customer?.id,
  });
  return new Response();
};
