import { type ActionFunctionArgs, json } from '@remix-run/node';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';

// Public storefront endpoint (Shopify App Proxy).
// Logs an impression or dismiss event for the conversion funnel. Conversions
// are logged by the capture endpoint, not here.
//
// Proxy path typically maps `/apps/klyna-capture/event` → this route.
const ALLOWED = new Set(['impression', 'dismiss']);

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== 'POST') {
    return json({ ok: false }, { status: 405 });
  }

  const { session } = await authenticate.public.appProxy(request);
  if (!session) {
    return json({ ok: false }, { status: 401 });
  }
  const shop = session.shop;

  const form = await request.formData();
  const type = String(form.get('type') ?? '');
  const popupId = String(form.get('popupId') ?? '');
  const device = String(form.get('device') ?? '') || null;
  const pageUrl = String(form.get('pageUrl') ?? '') || null;

  if (!ALLOWED.has(type)) {
    return json({ ok: false, error: 'Invalid event type' }, { status: 422 });
  }

  // Ensure the popup belongs to this shop before recording.
  const popup = await prisma.popup.findFirst({
    where: { id: popupId, shop },
    select: { id: true },
  });
  if (!popup) {
    return json({ ok: false, error: 'Unknown popup' }, { status: 404 });
  }

  await prisma.popupEvent.create({
    data: { shop, popupId: popup.id, type, device, pageUrl },
  });

  return json({ ok: true });
};
