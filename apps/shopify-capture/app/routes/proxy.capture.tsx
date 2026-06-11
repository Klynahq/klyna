import { type ActionFunctionArgs, json } from '@remix-run/node';
import shopify, { authenticate } from '../shopify.server';
import prisma from '../db.server';
import { syncSubscriberToShopify } from '../lib/customer-sync.server';
import {
  collectsEmail,
  collectsPhone,
  isValidEmail,
  isValidPhone,
} from '../lib/popups';

// Public storefront endpoint (Shopify App Proxy).
// Records an opt-in: validates input, persists a Subscriber, writes the contact
// to Shopify customers with marketing consent, and logs a conversion event.
//
// For spin-to-win, the winning segment's code is returned so the widget can
// reveal it. Proxy path typically maps `/apps/klyna-capture/capture` here.
export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== 'POST') {
    return json({ ok: false, error: 'Method not allowed' }, { status: 405 });
  }

  const { session } = await authenticate.public.appProxy(request);
  if (!session) {
    return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  const shop = session.shop;

  const form = await request.formData();
  const popupId = String(form.get('popupId') ?? '');
  const email = String(form.get('email') ?? '').trim() || null;
  const phone = String(form.get('phone') ?? '').trim() || null;
  const emailConsent = form.get('emailConsent') === 'true' || form.get('emailConsent') === 'on';
  const smsConsent = form.get('smsConsent') === 'true' || form.get('smsConsent') === 'on';
  const pageUrl = String(form.get('pageUrl') ?? '') || null;
  const device = String(form.get('device') ?? '') || null;
  const audience = String(form.get('audience') ?? '') || null;

  const popup = await prisma.popup.findFirst({ where: { id: popupId, shop } });
  if (!popup) {
    return json({ ok: false, error: 'Unknown popup' }, { status: 404 });
  }

  // Validate against what the popup format is allowed to collect.
  if (collectsEmail(popup.format)) {
    if (!email || !isValidEmail(email)) {
      return json({ ok: false, error: 'A valid email is required' }, { status: 422 });
    }
  }
  if (collectsPhone(popup.format) && phone) {
    if (!isValidPhone(phone)) {
      return json({ ok: false, error: 'Enter a valid phone number' }, { status: 422 });
    }
  }
  if (popup.format === 'sms' && (!phone || !isValidPhone(phone))) {
    return json({ ok: false, error: 'A valid phone number is required' }, { status: 422 });
  }

  // Persist the subscriber (idempotent on popupId + email).
  let subscriberId: string;
  try {
    const sub = await prisma.subscriber.upsert({
      where: { popupId_email: { popupId: popup.id, email: email ?? '' } },
      update: { phone, emailConsent, smsConsent, pageUrl, device, audience },
      create: {
        shop,
        popupId: popup.id,
        email,
        phone,
        emailConsent,
        smsConsent,
        pageUrl,
        device,
        audience,
      },
    });
    subscriberId = sub.id;
  } catch {
    // Fallback when email is null (the composite unique can't key on null).
    const sub = await prisma.subscriber.create({
      data: { shop, popupId: popup.id, email, phone, emailConsent, smsConsent, pageUrl, device, audience },
    });
    subscriberId = sub.id;
  }

  // Write to Shopify customers using an offline admin client for this shop.
  try {
    const { admin } = await shopify.unauthenticated.admin(shop);
    const result = await syncSubscriberToShopify(admin, {
      email,
      phone,
      emailConsent,
      smsConsent,
    });
    await prisma.subscriber.update({
      where: { id: subscriberId },
      data: {
        syncState: result.state,
        shopifyCustomerId: result.customerId ?? null,
        syncError: result.error ?? null,
      },
    });
  } catch (err) {
    await prisma.subscriber.update({
      where: { id: subscriberId },
      data: {
        syncState: 'error',
        syncError: err instanceof Error ? err.message : 'Sync failed',
      },
    });
  }

  // Log a conversion event for analytics.
  await prisma.popupEvent.create({
    data: { shop, popupId: popup.id, type: 'conversion', device, pageUrl },
  });

  // Resolve the discount code to reveal. Spin-to-win picks a weighted segment.
  let code = popup.discountCode ?? null;
  let prizeLabel: string | null = null;
  if (popup.format === 'spin_to_win') {
    const won = String(form.get('wonCode') ?? '').trim();
    code = won || null;
    prizeLabel = String(form.get('wonLabel') ?? '').trim() || null;
  }

  return json({ ok: true, code, prizeLabel, message: popup.successMessage });
};
