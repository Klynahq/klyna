import { type ActionFunctionArgs } from '@remix-run/node';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';

// GDPR mandatory webhook: shop/redact.
// Delete all rows for the shop across every Prisma model, including the
// session rows so the install is fully purged.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  await prisma.wishlistItem.deleteMany({ where: { shop } });
  await prisma.wishlist.deleteMany({ where: { shop } });
  await prisma.wishlistEvent.deleteMany({ where: { shop } });
  await prisma.aiSettings.deleteMany({ where: { shop } });
  await prisma.aiUsage.deleteMany({ where: { shop } });
  await prisma.session.deleteMany({ where: { shop } });

  return new Response(null, { status: 200 });
};
