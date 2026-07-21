import { PrismaSessionStorage } from '@shopify/shopify-app-session-storage-prisma';
import type { PrismaClient as PrismaClientType } from '../generated/prisma-client/client';
import { getProductKey } from './products';

type ShopifySession = {
  id: string;
  shop: string;
};

export function productSessionIdPrefix() {
  return `${getProductKey()}:`;
}

export class ProductSessionStorage {
  private readonly storage;
  private readonly prefix = productSessionIdPrefix();

  constructor(prisma: PrismaClientType) {
    this.storage = new PrismaSessionStorage(prisma as never);
  }

  async storeSession(session: ShopifySession) {
    const originalId = session.id;
    session.id = this.scopedId(originalId);

    try {
      return await this.storage.storeSession(session as never);
    } finally {
      session.id = originalId;
    }
  }

  async loadSession(id: string) {
    const session = (await this.storage.loadSession(this.scopedId(id))) as
      | ShopifySession
      | undefined;

    if (session) {
      session.id = this.unscopedId(session.id);
    }

    return session;
  }

  async deleteSession(id: string) {
    return this.storage.deleteSession(this.scopedId(id));
  }

  async deleteSessions(ids: string[]) {
    return this.storage.deleteSessions(ids.map((id) => this.scopedId(id)));
  }

  async findSessionsByShop(shop: string) {
    const sessions = ((await this.storage.findSessionsByShop(shop)) as ShopifySession[]).filter(
      (session) => session.id.startsWith(this.prefix),
    );

    for (const session of sessions) {
      session.id = this.unscopedId(session.id);
    }

    return sessions;
  }

  async isReady() {
    return this.storage.isReady();
  }

  private scopedId(id: string) {
    return id.startsWith(this.prefix) ? id : `${this.prefix}${id}`;
  }

  private unscopedId(id: string) {
    return id.startsWith(this.prefix) ? id.slice(this.prefix.length) : id;
  }
}
