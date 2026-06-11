import { type ActionFunctionArgs } from '@remix-run/node';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';

// GDPR / Shopify App Store mandatory webhook.
// Shopify sends the customer's email + phone for redaction. We use those to
// purge any waitlist subscriptions and queued notifications keyed on the
// shopper's contact info. No customerId column exists in our schema.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  const customer = (payload as { customer?: { email?: string | null; phone?: string | null } })
    .customer;
  const email = customer?.email ?? undefined;
  const phone = customer?.phone ?? undefined;

  if (email || phone) {
    const subs = await prisma.subscription.findMany({
      where: {
        shop,
        OR: [
          ...(email ? [{ email }] : []),
          ...(phone ? [{ phone }] : []),
        ],
      },
      select: { id: true },
    });
    const subIds = subs.map((s) => s.id);

    if (subIds.length > 0) {
      await prisma.alert.deleteMany({ where: { shop, subscriptionId: { in: subIds } } });
      await prisma.queuedNotification.deleteMany({
        where: { shop, subscriptionId: { in: subIds } },
      });
      await prisma.subscription.deleteMany({ where: { shop, id: { in: subIds } } });
    }

    if (email || phone) {
      await prisma.queuedNotification.deleteMany({
        where: {
          shop,
          OR: [
            ...(email ? [{ recipient: email }] : []),
            ...(phone ? [{ recipient: phone }] : []),
          ],
        },
      });
      await prisma.alert.deleteMany({
        where: {
          shop,
          OR: [
            ...(email ? [{ recipient: email }] : []),
            ...(phone ? [{ recipient: phone }] : []),
          ],
        },
      });
    }
  }

  return new Response(null, { status: 200 });
};
