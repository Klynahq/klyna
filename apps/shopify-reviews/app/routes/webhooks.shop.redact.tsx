import { type ActionFunctionArgs } from '@remix-run/node';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';

// GDPR mandatory webhook: shop/redact.
// Fires 48h after app uninstall. Delete all rows for the shop across all
// Prisma models (including sessions).
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  await prisma.session.deleteMany({ where: { shop } });
  await prisma.review.deleteMany({ where: { shop } });
  await prisma.productRating.deleteMany({ where: { shop } });
  await prisma.reviewRequest.deleteMany({ where: { shop } });
  await prisma.settings.deleteMany({ where: { shop } });
  await prisma.aiSettings.deleteMany({ where: { shop } });
  await prisma.aiUsage.deleteMany({ where: { shop } });
  return new Response();
};
