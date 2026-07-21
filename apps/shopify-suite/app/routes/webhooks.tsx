import type { ActionFunctionArgs } from '@remix-run/node';
import prisma from '../db.server';
import { productSessionIdPrefix } from '../lib/product-session-storage.server';
import { authenticate } from '../shopify.server';

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  if (topic === 'APP_UNINSTALLED' && session) {
    await prisma.session.deleteMany({
      where: { shop, id: { startsWith: productSessionIdPrefix() } },
    });
  }

  return new Response();
};
