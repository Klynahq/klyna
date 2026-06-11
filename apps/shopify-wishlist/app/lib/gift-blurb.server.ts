// Klyna Wishlist — gift-guide blurb generation.
//
// When a shopper shares their wishlist for the first time, we ask the
// per-shop AI client to suggest the best 2-item bundle gift and write a
// ~40-word blurb the recipient sees at the top of the shared list.

import prisma from '../db.server';
import { getAiClientForShop, getShopAiSettings } from './ai.server';

export type GiftBlurbResult = {
  ok: boolean;
  blurb?: string;
  error?: string;
  source?: 'live' | 'cache' | 'existing';
};

type WishlistWithItems = {
  id: string;
  shop: string;
  giftBlurb: string | null;
  items: { productTitle: string; price: string | null; currency: string | null }[];
};

function buildPrompt(items: WishlistWithItems['items']): string {
  const lines = items
    .slice(0, 12)
    .map((i, idx) => {
      const price = i.price ? ` (${i.price} ${i.currency ?? ''})`.trimEnd() : '';
      const title = i.productTitle || 'Untitled product';
      return `${idx + 1}. ${title}${price}`;
    })
    .join('\n');

  return [
    'A shopper has shared the following wishlist:',
    '',
    lines,
    '',
    'Pick the best two items from the list to suggest as a bundle gift.',
    'Write one short paragraph of about 40 words, addressed to the gift-giver.',
    'Name the two items by their titles. Say why they pair well.',
    'Plain prose. No bullet list. No headings. No emoji. No superlatives.',
    'Return only the paragraph.',
  ].join('\n');
}

// Generate a gift blurb for a wishlist and persist it. If a blurb already
// exists on the row we return it as-is so the storefront stays cheap.
export async function ensureGiftBlurb(
  shop: string,
  wishlistId: string,
  opts: { force?: boolean } = {},
): Promise<GiftBlurbResult> {
  const wishlist = (await prisma.wishlist.findFirst({
    where: { id: wishlistId, shop },
    include: { items: { orderBy: { createdAt: 'desc' } } },
  })) as WishlistWithItems | null;

  if (!wishlist) {
    return { ok: false, error: 'Wishlist not found.' };
  }

  if (wishlist.giftBlurb && !opts.force) {
    return { ok: true, blurb: wishlist.giftBlurb, source: 'existing' };
  }

  if (wishlist.items.length < 2) {
    return { ok: false, error: 'Add at least two products to generate a gift-bundle blurb.' };
  }

  const settings = await getShopAiSettings(shop);
  if (settings.provider === 'off') {
    return { ok: false, error: 'Enable AI in Settings to generate gift-guide blurbs.' };
  }

  const ai = await getAiClientForShop(shop);
  const out = await ai.complete({
    prompt: buildPrompt(wishlist.items),
    temperature: 0.5,
    maxTokens: 180,
    cacheKey: `gift-blurb:${wishlist.id}:${wishlist.items.length}`,
  });

  if (out.error) {
    return { ok: false, error: out.error };
  }

  const blurb = out.text.trim();
  if (!blurb) {
    return { ok: false, error: 'AI returned an empty response.' };
  }

  await prisma.wishlist.update({
    where: { id: wishlist.id },
    data: { giftBlurb: blurb },
  });

  return { ok: true, blurb, source: out.source };
}
