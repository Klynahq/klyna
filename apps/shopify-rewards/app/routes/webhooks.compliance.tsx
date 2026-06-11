import { type ActionFunctionArgs } from '@remix-run/node';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';

// Unified GDPR compliance endpoint. Shopify sends all three mandatory
// compliance topics here (customers/data_request, customers/redact, shop/redact)
// when the app is configured with `compliance_topics` in shopify.app.toml.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  console.log(`[GDPR] ${topic} received for ${shop}`);

  if (topic === 'CUSTOMERS_DATA_REQUEST') {
    // Klyna Rewards stores no customer PII beyond Shopify customer GID and
    // optional email/displayName for loyalty bookkeeping. Acknowledge with 200.
    return new Response();
  }

  if (topic === 'CUSTOMERS_REDACT') {
    const customer = (payload as { customer?: { id?: number | string } } | undefined)?.customer;
    const rawId = customer?.id;
    if (rawId !== undefined && rawId !== null) {
      const customerGid = `gid://shopify/Customer/${rawId}`;
      await prisma.member.deleteMany({
        where: { shop, customerId: { in: [String(rawId), customerGid] } },
      });
    }
    return new Response();
  }

  if (topic === 'SHOP_REDACT') {
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
  }

  return new Response();
};
