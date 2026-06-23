import { type ActionFunctionArgs } from '@remix-run/node';
import prisma from '../db.server';
import { authenticate } from '../shopify.server';

function normalizeTopic(topic: string) {
  const lower = topic.toLowerCase();
  if (lower === 'app/uninstalled' || lower === 'app_uninstalled') return 'app/uninstalled';
  if (lower === 'customers/data_request' || lower === 'customers_data_request') {
    return 'customers/data_request';
  }
  if (lower === 'customers/redact' || lower === 'customers_redact') return 'customers/redact';
  if (lower === 'shop/redact' || lower === 'shop_redact') return 'shop/redact';
  return lower;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  const normalizedTopic = normalizeTopic(topic);
  console.log(`Received ${topic} webhook for ${shop}`);

  if (normalizedTopic === 'app/uninstalled') {
    await prisma.session.deleteMany({ where: { shop } });
    return new Response();
  }

  if (normalizedTopic === 'customers/data_request') {
    return new Response();
  }

  if (normalizedTopic === 'customers/redact') {
    return new Response();
  }

  if (normalizedTopic === 'shop/redact') {
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
  }

  return new Response('Unhandled webhook topic', { status: 200 });
};
