// Cart-recovery one-liner generator.
//
// Given a cart snapshot + visit count, returns one short line (under 60 chars)
// nudging the shopper. The angle varies based on cart state:
//   - close to free-shipping threshold => unlock angle
//   - returning visitor              => social-proof angle
//   - everything else                => light reminder
//
// Results are cached per cart hash for 1h so a noisy storefront does not blow
// through the daily AI quota.

import { createAiClient } from '@klyna/ai-client';
import prisma from '../db.server';
import { getShopAiSettings } from './ai.server';

function utcDayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

export type CartLineSnapshot = {
  title?: string;
  quantity?: number;
  price?: number;
};

export type RecoverInput = {
  shop: string;
  lines: CartLineSnapshot[];
  cartTotal: number;
  visitCount: number;
  freeShipThreshold?: number;
  currency?: string;
};

export type RecoverOutput = {
  message: string;
  angle: 'free-shipping-unlock' | 'social-proof' | 'reminder' | 'off';
  cached: boolean;
  error?: string;
};

function pickAngle(input: RecoverInput): RecoverOutput['angle'] {
  const threshold = input.freeShipThreshold ?? 0;
  if (threshold > 0) {
    const remaining = threshold - input.cartTotal;
    if (remaining > 0 && remaining <= threshold * 0.4) {
      return 'free-shipping-unlock';
    }
  }
  if (input.visitCount >= 2) return 'social-proof';
  return 'reminder';
}

function cartHash(input: RecoverInput): string {
  const items = input.lines
    .map((l) => `${(l.title ?? '').toLowerCase().trim()}x${l.quantity ?? 1}`)
    .sort()
    .join('|');
  return `${input.shop}|${items}|t=${Math.round(input.cartTotal)}|v=${Math.min(input.visitCount, 5)}`;
}

function buildPrompt(input: RecoverInput, angle: RecoverOutput['angle']): string {
  const items = input.lines
    .slice(0, 6)
    .map((l) => `- ${l.title ?? 'item'} x${l.quantity ?? 1}`)
    .join('\n');
  const currency = input.currency ?? 'USD';
  const threshold = input.freeShipThreshold ?? 0;
  const remaining = Math.max(0, threshold - input.cartTotal);

  const base =
    `Write a single cart-recovery line under 60 characters. ` +
    `No emoji, no superlatives, no exclamation marks, no quotes. ` +
    `Plain ASCII only. Output only the line, no preface.\n\n`;

  if (angle === 'free-shipping-unlock') {
    return (
      base +
      `Angle: shopper is close to free shipping. Free shipping unlocks at ` +
      `${remaining.toFixed(2)} ${currency} more. Encourage adding a small item.\n\n` +
      `Cart:\n${items}`
    );
  }
  if (angle === 'social-proof') {
    return (
      base +
      `Angle: returning visitor (visit ${input.visitCount}). Mention that the items ` +
      `they keep coming back to are popular with other shoppers, in honest terms.\n\n` +
      `Cart:\n${items}`
    );
  }
  return (
    base +
    `Angle: gentle reminder that the cart is still here, ready to check out.\n\n` +
    `Cart:\n${items}`
  );
}

export async function generateRecoverLine(input: RecoverInput): Promise<RecoverOutput> {
  const settings = await getShopAiSettings(input.shop);
  if (settings.provider === 'off' || !settings.apiKey) {
    return { message: '', angle: 'off', cached: false, error: 'AI is off' };
  }

  const angle = pickAngle(input);
  const shop = input.shop;
  // Use a 1h cache TTL for recover lines so they re-roll as the day progresses.
  const client = createAiClient({
    provider: settings.provider,
    apiKey: settings.apiKey,
    model: settings.model,
    cacheTtl: 3600,
    cache: {
      async get(key) {
        const row = await prisma.aiCache.findUnique({ where: { key } });
        if (!row) return null;
        if (row.expiresAt < new Date()) {
          await prisma.aiCache.delete({ where: { key } });
          return null;
        }
        return row.value;
      },
      async set(key, value, ttlSeconds) {
        const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
        await prisma.aiCache.upsert({
          where: { key },
          update: { value, expiresAt },
          create: { key, value, expiresAt },
        });
      },
    },
    quota: {
      async incrementToday() {
        const day = utcDayStamp();
        const row = await prisma.aiUsage.upsert({
          where: { shop_day: { shop, day } },
          update: { count: { increment: 1 } },
          create: { shop, day, count: 1 },
        });
        return row.count;
      },
      async limit() {
        return settings.dailyCap;
      },
    },
  });
  const cacheKey = `recover:${angle}:${cartHash(input)}`;

  const out = await client.complete({
    prompt: buildPrompt(input, angle),
    cacheKey,
    maxTokens: 60,
    temperature: 0.5,
  });

  // 1h TTL is handled by passing cacheTtl on createAiClient by default 24h;
  // recover lines are short-lived so we mark them cached and trust the key
  // collision to refresh when the cart shifts meaningfully.
  if (out.error) {
    return { message: '', angle, cached: false, error: out.error };
  }

  // Hard-trim to 60 chars and strip stray quotes / trailing punctuation.
  let line = out.text.replace(/^["'\s]+|["'\s]+$/g, '').replace(/\s+/g, ' ');
  if (line.length > 60) line = line.slice(0, 60).trimEnd();

  return { message: line, angle, cached: out.source === 'cache' };
}
