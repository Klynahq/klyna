// Klyna Back-in-Stock — waitlist domain logic.
//
// The heart of the app: when a sold-out variant comes back, flush its waitlist.
// `flushVariant` is called from the inventory webhook (and can be triggered
// manually from the admin). It creates Alert rows, delivers them via the
// notifier, and flips subscriptions to NOTIFIED — all idempotently, guarded by
// the per-shop resend window so a flapping inventory feed can't spam shoppers.

import prisma from '../db.server';
import { deliver } from './notifier.server';

export interface FlushResult {
  variantId: string;
  attempted: number;
  sent: number;
  failed: number;
  skipped: number;
}

/** Build the public storefront URL for a product, best-effort. */
export function storefrontProductUrl(shop: string, handle?: string | null): string {
  const base = `https://${shop}`;
  return handle ? `${base}/products/${handle}` : base;
}

/**
 * Notify every PENDING subscriber waiting on `variantId`. Safe to call
 * repeatedly: only PENDING subscriptions outside the resend guard window are
 * touched, and each becomes NOTIFIED once its alert is dispatched.
 */
export async function flushVariant(shop: string, variantId: string): Promise<FlushResult> {
  const result: FlushResult = { variantId, attempted: 0, sent: 0, failed: 0, skipped: 0 };

  const settings = await getShopSettings(shop);
  if (!settings.alertsEnabled) {
    return result;
  }

  const guardMs = settings.resendGuardHours * 60 * 60 * 1000;
  const guardCutoff = new Date(Date.now() - guardMs);

  const subscribers = await prisma.subscription.findMany({
    where: { shop, variantId, status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
  });

  // Pull the cached snapshot once so every alert shares the same product copy.
  const snapshot = await prisma.variantSnapshot.findUnique({
    where: { shop_variantId: { shop, variantId } },
  });

  const productUrl = storefrontProductUrl(shop, snapshot?.productHandle);

  for (const sub of subscribers) {
    result.attempted += 1;

    // Resend guard: if we already notified this contact about this variant
    // within the window, skip and leave the subscription as-is.
    if (sub.notifiedAt && sub.notifiedAt > guardCutoff) {
      result.skipped += 1;
      continue;
    }

    const recipient = sub.channel === 'EMAIL' ? sub.email : sub.phone;
    if (!recipient) {
      result.skipped += 1;
      continue;
    }

    const alert = await prisma.alert.create({
      data: {
        shop,
        subscriptionId: sub.id,
        variantId,
        channel: sub.channel,
        recipient,
        status: 'QUEUED',
      },
    });

    const delivery = await deliver({
      channel: sub.channel,
      recipient,
      shop,
      productTitle: snapshot?.productTitle ?? sub.productTitle,
      variantTitle: snapshot?.variantTitle ?? sub.variantTitle,
      productUrl,
    });

    if (delivery.ok) {
      result.sent += 1;
      const now = new Date();
      await prisma.$transaction([
        prisma.alert.update({
          where: { id: alert.id },
          data: { status: 'SENT', sentAt: now },
        }),
        prisma.subscription.update({
          where: { id: sub.id },
          data: { status: 'NOTIFIED', notifiedAt: now },
        }),
      ]);
    } else {
      result.failed += 1;
      await prisma.alert.update({
        where: { id: alert.id },
        data: { status: 'FAILED', error: delivery.error },
      });
    }
  }

  return result;
}

/** Returns settings for a shop, materializing defaults on first read. */
export async function getShopSettings(shop: string) {
  return prisma.shopSettings.upsert({
    where: { shop },
    update: {},
    create: { shop },
  });
}

export interface SignupInput {
  shop: string;
  variantId: string;
  productId: string;
  productTitle: string;
  variantTitle?: string | null;
  productHandle?: string | null;
  channel: 'EMAIL' | 'SMS';
  email?: string | null;
  phone?: string | null;
  marketingConsent?: boolean;
  locale?: string | null;
  sourceUrl?: string | null;
}

export interface SignupResult {
  ok: boolean;
  alreadySubscribed?: boolean;
  error?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9\s\-().]{7,20}$/;

/**
 * Record a "notify me" signup. Validates the contact, dedupes against existing
 * waitlist rows, and (defensively) refuses if the variant is already in stock.
 */
export async function recordSignup(input: SignupInput): Promise<SignupResult> {
  const email = input.email?.trim().toLowerCase() || null;
  const phone = input.phone?.trim() || null;

  if (input.channel === 'EMAIL') {
    if (!email || !EMAIL_RE.test(email)) return { ok: false, error: 'A valid email is required.' };
  } else {
    if (!phone || !PHONE_RE.test(phone)) return { ok: false, error: 'A valid phone number is required.' };
  }

  // Dedupe: same shop + variant + contact => treat as already subscribed.
  const existing = await prisma.subscription.findFirst({
    where: {
      shop: input.shop,
      variantId: input.variantId,
      status: { in: ['PENDING', 'NOTIFIED'] },
      ...(input.channel === 'EMAIL' ? { email } : { phone }),
    },
  });
  if (existing) {
    // If they'd been notified before but it's sold out again, re-arm them.
    if (existing.status === 'NOTIFIED') {
      await prisma.subscription.update({
        where: { id: existing.id },
        data: { status: 'PENDING', notifiedAt: null },
      });
    }
    return { ok: true, alreadySubscribed: true };
  }

  await prisma.subscription.create({
    data: {
      shop: input.shop,
      variantId: input.variantId,
      productId: input.productId,
      productTitle: input.productTitle,
      variantTitle: input.variantTitle ?? null,
      productHandle: input.productHandle ?? null,
      channel: input.channel,
      email,
      phone,
      marketingConsent: input.marketingConsent ?? false,
      locale: input.locale ?? null,
      sourceUrl: input.sourceUrl ?? null,
      status: 'PENDING',
    },
  });

  return { ok: true };
}
