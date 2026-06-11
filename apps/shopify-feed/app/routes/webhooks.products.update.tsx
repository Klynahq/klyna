import { type ActionFunctionArgs } from '@remix-run/node';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';

// A product changed — mark this shop's enabled feeds stale so the next
// scheduled tick (or a manual refresh) regenerates them. We deliberately do
// not regenerate inline: a single product save shouldn't trigger a full feed
// rebuild on the webhook thread.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  await prisma.feed.updateMany({
    where: { shop, enabled: true },
    data: { nextRefreshAt: new Date() },
  });

  return new Response();
};
