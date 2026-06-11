// Klyna Wishlist — storefront JSON API (served via App Proxy at
// /apps/wishlist/api). The Theme App Extension talks to this endpoint to
// save, remove, and list wishlist items. Shopify signs every proxied request,
// so authenticate.public.appProxy verifies the HMAC for us.

import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/node';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';
import {
  findOrCreateWishlist,
  recordEvent,
  resolveProducts,
} from '../wishlist.server';
import { ensureGiftBlurb } from '../lib/gift-blurb.server';

// CORS-safe JSON helper. App Proxy requests are same-origin from the
// storefront domain, but we set the header defensively for theme previews.
function reply(data: unknown, status = 200) {
  return json(data, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

// GET /apps/wishlist/api?guest=<id>  → current wishlist for this shopper.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);
  if (!session) return reply({ error: 'No session' }, 401);
  const shop = session.shop;

  const url = new URL(request.url);
  const guestId = url.searchParams.get('guest') || undefined;
  const customerId = url.searchParams.get('logged_in_customer_id')
    ? `gid://shopify/Customer/${url.searchParams.get('logged_in_customer_id')}`
    : undefined;

  const wishlist = await findOrCreateWishlist({ shop, customerId, guestId });
  await recordEvent({ shop, type: 'view', wishlistId: wishlist.id });

  return reply({
    token: wishlist.token,
    items: wishlist.items.map((i) => ({
      productId: i.productId,
      variantId: i.variantId,
      title: i.productTitle,
      handle: i.productHandle,
      image: i.imageUrl,
      price: i.price,
      currency: i.currency,
    })),
  });
};

// POST /apps/wishlist/api  → mutate the wishlist.
// body: { action: "add" | "remove" | "merge", productId, variantId?, guest?, items? }
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.public.appProxy(request);
  if (!session || !admin) return reply({ error: 'No session' }, 401);
  const shop = session.shop;

  const url = new URL(request.url);
  const customerId = url.searchParams.get('logged_in_customer_id')
    ? `gid://shopify/Customer/${url.searchParams.get('logged_in_customer_id')}`
    : undefined;

  let payload: {
    action?: string;
    productId?: string;
    variantId?: string | null;
    guest?: string;
    items?: { productId: string; variantId?: string | null }[];
  };
  try {
    payload = await request.json();
  } catch {
    return reply({ error: 'Invalid JSON body' }, 400);
  }

  const guestId = payload.guest || undefined;
  const wishlist = await findOrCreateWishlist({ shop, customerId, guestId });

  const toGid = (id: string) =>
    id.startsWith('gid://') ? id : `gid://shopify/Product/${id}`;

  if (payload.action === 'add' && payload.productId) {
    const productId = toGid(payload.productId);
    const resolved = await resolveProducts(admin.graphql, [productId]);
    const p = resolved.get(productId);
    await prisma.wishlistItem.upsert({
      where: {
        wishlistId_productId_variantId: {
          wishlistId: wishlist.id,
          productId,
          variantId: payload.variantId ?? '',
        },
      },
      create: {
        wishlistId: wishlist.id,
        shop,
        productId,
        variantId: payload.variantId ?? '',
        productTitle: p?.title ?? '',
        productHandle: p?.handle ?? '',
        imageUrl: p?.imageUrl ?? null,
        price: p?.price ?? null,
        currency: p?.currency ?? null,
      },
      update: {},
    });
    await recordEvent({ shop, type: 'add', productId, wishlistId: wishlist.id });
  } else if (payload.action === 'remove' && payload.productId) {
    const productId = toGid(payload.productId);
    await prisma.wishlistItem.deleteMany({
      where: { wishlistId: wishlist.id, productId, variantId: payload.variantId ?? '' },
    });
    await recordEvent({ shop, type: 'remove', productId, wishlistId: wishlist.id });
  } else if (payload.action === 'share') {
    // First share flips the wishlist public and (best-effort) generates a
    // 40-word gift-bundle blurb so the recipient sees it on the share page.
    await prisma.wishlist.update({
      where: { id: wishlist.id },
      data: { isPublic: true },
    });
    await recordEvent({ shop, type: 'share', wishlistId: wishlist.id });
    const blurb = await ensureGiftBlurb(shop, wishlist.id);
    return reply({
      token: wishlist.token,
      blurb: blurb.ok ? blurb.blurb : null,
      blurbError: blurb.ok ? null : blurb.error,
    });
  } else if (payload.action === 'merge' && Array.isArray(payload.items)) {
    // Sync the guest's localStorage list into the server on login / first load.
    const ids = payload.items.map((i) => toGid(i.productId));
    const resolved = await resolveProducts(admin.graphql, ids);
    for (const raw of payload.items) {
      const productId = toGid(raw.productId);
      const p = resolved.get(productId);
      await prisma.wishlistItem.upsert({
        where: {
          wishlistId_productId_variantId: {
            wishlistId: wishlist.id,
            productId,
            variantId: raw.variantId ?? '',
          },
        },
        create: {
          wishlistId: wishlist.id,
          shop,
          productId,
          variantId: raw.variantId ?? '',
          productTitle: p?.title ?? '',
          productHandle: p?.handle ?? '',
          imageUrl: p?.imageUrl ?? null,
          price: p?.price ?? null,
          currency: p?.currency ?? null,
        },
        update: {},
      });
    }
  } else {
    return reply({ error: 'Unknown or incomplete action' }, 400);
  }

  const fresh = await prisma.wishlistItem.findMany({
    where: { wishlistId: wishlist.id },
    orderBy: { createdAt: 'desc' },
  });

  return reply({
    token: wishlist.token,
    items: fresh.map((i) => ({
      productId: i.productId,
      variantId: i.variantId,
      title: i.productTitle,
      handle: i.productHandle,
      image: i.imageUrl,
      price: i.price,
      currency: i.currency,
    })),
  });
};
