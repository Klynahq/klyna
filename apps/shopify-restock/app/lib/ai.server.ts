// Per-shop AI client wired into Prisma for cache + quota.
//
// Each Shopify session gets its own AI client backed by the AiSettings row
// for the shop. Cache and quota are also DB-backed so they survive restarts.

import { createAiClient, type AiProvider, type AiClient } from '~/lib/klyna-ai-client';
import prisma from '../db.server';
import { decryptSecret, encryptSecret, isEncryptedSecret } from './secret.server';

export type ShopAiSettings = {
  provider: AiProvider;
  apiKey?: string;
  model?: string;
  dailyCap: number;
};

export async function getShopAiSettings(shop: string): Promise<ShopAiSettings> {
  const row = await prisma.aiSettings.findUnique({ where: { shop } });
  if (!row) {
    return { provider: 'off', dailyCap: 100 };
  }

  let apiKey: string | undefined;
  if (row.apiKey) {
    apiKey = decryptSecret(row.apiKey);
    if (!isEncryptedSecret(row.apiKey)) {
      await prisma.aiSettings.update({
        where: { shop },
        data: { apiKey: encryptSecret(row.apiKey) },
      });
    }
  }

  return {
    provider: row.provider as AiProvider,
    apiKey,
    model: row.model ?? undefined,
    dailyCap: row.dailyCap,
  };
}

export async function saveShopAiSettings(shop: string, input: Partial<ShopAiSettings>): Promise<void> {
  const existing = await prisma.aiSettings.findUnique({ where: { shop } });
  const encryptedApiKey =
    input.apiKey !== undefined ? encryptSecret(input.apiKey) : existing?.apiKey;

  await prisma.aiSettings.upsert({
    where: { shop },
    update: {
      provider: input.provider ?? existing?.provider ?? 'off',
      apiKey: encryptedApiKey,
      model: input.model ?? existing?.model,
      dailyCap: input.dailyCap ?? existing?.dailyCap ?? 100,
    },
    create: {
      shop,
      provider: input.provider ?? 'off',
      apiKey: encryptedApiKey,
      model: input.model,
      dailyCap: input.dailyCap ?? 100,
    },
  });
}

function utcDayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function getAiClientForShop(shop: string): Promise<AiClient> {
  const settings = await getShopAiSettings(shop);
  return createAiClient({
    provider: settings.provider,
    apiKey: settings.apiKey,
    model: settings.model,
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
}

export async function getTodayUsage(shop: string): Promise<number> {
  const row = await prisma.aiUsage.findUnique({
    where: { shop_day: { shop, day: utcDayStamp() } },
  });
  return row?.count ?? 0;
}
