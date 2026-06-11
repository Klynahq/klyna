import { type ActionFunctionArgs } from '@remix-run/node';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';

// A product was deleted — same treatment as products/update: flag the shop's
// feeds for refresh so the deleted item drops out of the next render.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  await prisma.feed.updateMany({
    where: { shop, enabled: true },
    data: { nextRefreshAt: new Date() },
  });

  return new Response();
};
