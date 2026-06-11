import { type ActionFunctionArgs } from '@remix-run/node';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';

// GDPR: shop/redact
// Fires 48 hours after a shop uninstalls the app. Delete every row scoped to
// this shop across all Prisma models, including the Shopify session rows.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop} — purging all shop data`);

  await prisma.$transaction([
    prisma.bundleItem.deleteMany({ where: { bundle: { shop } } }),
    prisma.bundle.deleteMany({ where: { shop } }),
    prisma.volumeTier.deleteMany({ where: { shop } }),
    prisma.fbtPair.deleteMany({ where: { shop } }),
    prisma.shopSettings.deleteMany({ where: { shop } }),
    prisma.bundleSale.deleteMany({ where: { shop } }),
    prisma.aiSettings.deleteMany({ where: { shop } }),
    prisma.aiUsage.deleteMany({ where: { shop } }),
    prisma.bundleSuggestion.deleteMany({ where: { shop } }),
    prisma.session.deleteMany({ where: { shop } }),
  ]);

  return new Response();
};
