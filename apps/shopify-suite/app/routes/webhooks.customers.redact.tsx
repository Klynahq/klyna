import type { ActionFunctionArgs } from '@remix-run/node';
import { authenticate } from '../shopify.server';

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`[GDPR] ${topic} for ${shop}: Klyna Shopify Suite stores no customer-scoped data.`);
  return new Response(null, { status: 200 });
};
