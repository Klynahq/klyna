import { type ActionFunctionArgs } from '@remix-run/node';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';

// GDPR mandatory webhook: shop/redact.
// Delete all rows for the shop across every model, including sessions.
export const action = async ({ request }: ActionFunctionArgs) => {
  if (!request.headers.get('x-shopify-hmac-sha256')) {
    return new Response(undefined, { status: 401, statusText: 'Unauthorized' });
  }

  const { shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  // Order: events + subscribers first (FK to Popup), then popups, then per-shop
  // settings, usage, and finally sessions.
  await prisma.popupEvent.deleteMany({ where: { shop } });
  await prisma.subscriber.deleteMany({ where: { shop } });
  await prisma.popup.deleteMany({ where: { shop } });
  await prisma.aiSettings.deleteMany({ where: { shop } });
  await prisma.aiUsage.deleteMany({ where: { shop } });
  await prisma.session.deleteMany({ where: { shop } });

  return new Response();
};
