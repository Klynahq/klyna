import { type ActionFunctionArgs } from '@remix-run/node';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';

// GDPR mandatory webhook: shop/redact.
// Fires 48h after uninstall. Delete every row owned by this shop across all
// Prisma models, including Shopify session rows.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`[GDPR] ${topic} received for ${shop}`);

  // Order matters less because of Cascade, but be explicit.
  await prisma.pointsEvent.deleteMany({ where: { shop } });
  await prisma.redemption.deleteMany({ where: { shop } });
  await prisma.referral.deleteMany({ where: { shop } });
  await prisma.member.deleteMany({ where: { shop } });
  await prisma.tier.deleteMany({ where: { shop } });
  await prisma.program.deleteMany({ where: { shop } });
  await prisma.aiSettings.deleteMany({ where: { shop } });
  await prisma.aiUsage.deleteMany({ where: { shop } });
  await prisma.session.deleteMany({ where: { shop } });

  return new Response();
};
