import { type ActionFunctionArgs } from '@remix-run/node';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';

// GDPR: shop/redact. Fires 48h after uninstall. Wipe every row keyed on this
// shop across all models, plus any lingering Sessions.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`[GDPR] ${topic} for ${shop} — purging all rows`);

  await prisma.$transaction([
    prisma.impression.deleteMany({ where: { shop } }),
    prisma.countdownTimer.deleteMany({ where: { shop } }),
    prisma.scarcityRule.deleteMany({ where: { shop } }),
    prisma.socialProofConfig.deleteMany({ where: { shop } }),
    prisma.proofEvent.deleteMany({ where: { shop } }),
    prisma.targetRule.deleteMany({ where: { shop } }),
    prisma.aiSettings.deleteMany({ where: { shop } }),
    prisma.aiUsage.deleteMany({ where: { shop } }),
    prisma.session.deleteMany({ where: { shop } }),
  ]);

  return new Response();
};
