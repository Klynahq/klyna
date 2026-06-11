// Scheduler-driven flush of the smart-timing queue.
//
// Call this on a cron (e.g. every 5 minutes) with the SCHEDULER_SECRET header.
// Any QueuedNotification whose dueAt has passed is delivered through the same
// notifier the live path uses, and the subscription is flipped to NOTIFIED.

import { timingSafeEqual } from 'node:crypto';
import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/node';
import prisma from '../db.server';
import { deliver } from '../services/notifier.server';
import { storefrontProductUrl } from '../services/waitlist.server';

function authorized(request: Request): boolean {
  const secret = process.env.SCHEDULER_SECRET;
  if (!secret) return false;
  const header =
    request.headers.get('x-scheduler-secret') ??
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    '';
  const a = Buffer.from(header);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function tick() {
  const now = new Date();
  const due = await prisma.queuedNotification.findMany({
    where: { status: 'QUEUED', dueAt: { lte: now } },
    take: 200,
    orderBy: { dueAt: 'asc' },
  });

  let sent = 0;
  let failed = 0;

  for (const q of due) {
    const sub = await prisma.subscription.findUnique({ where: { id: q.subscriptionId } });
    if (!sub) {
      await prisma.queuedNotification.update({
        where: { id: q.id },
        data: { status: 'FAILED', error: 'subscription_missing' },
      });
      failed += 1;
      continue;
    }

    const snapshot = await prisma.variantSnapshot.findUnique({
      where: { shop_variantId: { shop: q.shop, variantId: q.variantId } },
    });
    const productUrl = storefrontProductUrl(q.shop, snapshot?.productHandle);

    const alert = await prisma.alert.create({
      data: {
        shop: q.shop,
        subscriptionId: sub.id,
        variantId: q.variantId,
        channel: q.channel === 'SMS' ? 'SMS' : 'EMAIL',
        recipient: q.recipient,
        status: 'QUEUED',
      },
    });

    const delivery = await deliver({
      channel: q.channel === 'SMS' ? 'SMS' : 'EMAIL',
      recipient: q.recipient,
      shop: q.shop,
      productTitle: snapshot?.productTitle ?? sub.productTitle,
      variantTitle: snapshot?.variantTitle ?? sub.variantTitle,
      productUrl,
    });

    if (delivery.ok) {
      const ts = new Date();
      await prisma.$transaction([
        prisma.alert.update({ where: { id: alert.id }, data: { status: 'SENT', sentAt: ts } }),
        prisma.subscription.update({
          where: { id: sub.id },
          data: { status: 'NOTIFIED', notifiedAt: ts },
        }),
        prisma.queuedNotification.update({
          where: { id: q.id },
          data: { status: 'SENT', sentAt: ts },
        }),
      ]);
      sent += 1;
    } else {
      await prisma.$transaction([
        prisma.alert.update({
          where: { id: alert.id },
          data: { status: 'FAILED', error: delivery.error },
        }),
        prisma.queuedNotification.update({
          where: { id: q.id },
          data: { status: 'FAILED', error: delivery.error },
        }),
      ]);
      failed += 1;
    }
  }

  return { processed: due.length, sent, failed };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (!authorized(request)) {
    return json({ error: 'unauthorized' }, { status: 401 });
  }
  const result = await tick();
  return json({ ok: true, ...result });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (!authorized(request)) {
    return json({ error: 'unauthorized' }, { status: 401 });
  }
  const result = await tick();
  return json({ ok: true, ...result });
};
