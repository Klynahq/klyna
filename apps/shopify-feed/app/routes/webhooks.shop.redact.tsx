import { type ActionFunctionArgs } from '@remix-run/node';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';

// GDPR mandatory webhook: shop/redact.
// Fires 48 hours after a shop uninstalls. Purge all shop-scoped rows across
// every Prisma model that has a `shop` field, plus session rows.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  await prisma.feedRun.deleteMany({ where: { shop } });
  await prisma.feed.deleteMany({ where: { shop } });
  await prisma.aiSettings.deleteMany({ where: { shop } });
  await prisma.aiUsage.deleteMany({ where: { shop } });
  await prisma.feedTitleOverride.deleteMany({ where: { shop } });
  await prisma.shopSettings.deleteMany({ where: { shop } });
  await prisma.session.deleteMany({ where: { shop } });

  return new Response();
};
