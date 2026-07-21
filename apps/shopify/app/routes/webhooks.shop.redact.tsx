import type { ActionFunctionArgs } from '@remix-run/node';
import prisma from '../db.server';
import { authenticate } from '../shopify.server';

// GDPR mandatory webhook: shop/redact.
// Fires 48h after uninstall. Delete every row for this shop across all
// Prisma models so we hold no further data about the merchant.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`[GDPR] ${topic} for ${shop}: purging all shop data.`);

  await prisma.$transaction([
    prisma.session.deleteMany({ where: { shop } }),
    prisma.auditResult.deleteMany({ where: { shop } }),
    prisma.aiSettings.deleteMany({ where: { shop } }),
    prisma.aiUsage.deleteMany({ where: { shop } }),
  ]);

  return new Response(null, { status: 200 });
};
