import { type ActionFunctionArgs } from '@remix-run/node';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';

// Single endpoint for all three GDPR mandatory webhooks:
//   - customers/data_request
//   - customers/redact
//   - shop/redact
// authenticate.webhook(request) verifies the HMAC and returns the topic.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`Received compliance webhook ${topic} for ${shop}.`);

  switch (topic) {
    case 'CUSTOMERS_DATA_REQUEST':
      // Klyna Sticky Cart stores no customer PII (only shop-scoped settings
      // and anonymous click events). Nothing to export.
      break;
    case 'CUSTOMERS_REDACT':
      // No customerId columns exist in current schema; nothing to delete.
      break;
    case 'SHOP_REDACT':
      // Wipe all shop-scoped data 48h after uninstall.
      await prisma.session.deleteMany({ where: { shop } });
      await prisma.stickyCartSettings.deleteMany({ where: { shop } });
      await prisma.clickEvent.deleteMany({ where: { shop } });
      await prisma.aiSettings.deleteMany({ where: { shop } });
      await prisma.aiUsage.deleteMany({ where: { shop } });
      break;
    default:
      console.warn(`Unhandled compliance topic: ${topic}`);
  }
  return new Response();
};
