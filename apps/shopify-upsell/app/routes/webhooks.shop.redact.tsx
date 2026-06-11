import { type ActionFunctionArgs } from '@remix-run/node';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';

// GDPR mandatory webhook: shop/redact.
// Fires 48 hours after app uninstall. Delete every row associated with
// the shop across all Prisma models, including sessions.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop} — purging shop data`);

  await prisma.offerEvent.deleteMany({ where: { shop } });
  await prisma.offerVariant.deleteMany({ where: { offer: { shop } } });
  await prisma.offer.deleteMany({ where: { shop } });
  await prisma.aiSettings.deleteMany({ where: { shop } });
  await prisma.aiUsage.deleteMany({ where: { shop } });
  await prisma.session.deleteMany({ where: { shop } });

  return new Response();
};
