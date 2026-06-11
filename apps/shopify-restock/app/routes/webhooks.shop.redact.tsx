import { type ActionFunctionArgs } from '@remix-run/node';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';

// GDPR / Shopify App Store mandatory webhook.
// Fires 48 hours after a shop uninstalls. Wipe every row we hold for the shop
// across every model that scopes data by `shop`.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  await prisma.alert.deleteMany({ where: { shop } });
  await prisma.queuedNotification.deleteMany({ where: { shop } });
  await prisma.subscription.deleteMany({ where: { shop } });
  await prisma.variantSnapshot.deleteMany({ where: { shop } });
  await prisma.shopSettings.deleteMany({ where: { shop } });
  await prisma.aiSettings.deleteMany({ where: { shop } });
  await prisma.aiUsage.deleteMany({ where: { shop } });
  await prisma.session.deleteMany({ where: { shop } });

  return new Response(null, { status: 200 });
};
