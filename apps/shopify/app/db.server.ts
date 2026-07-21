// Klyna for Shopify — Prisma client (Postgres).
import { PrismaClient } from './generated/prisma-client/client';
import type { PrismaClient as PrismaClientType } from './generated/prisma-client/client';

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClientType | undefined;
}

const prisma: PrismaClientType = global.prismaGlobal ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  global.prismaGlobal = prisma;
}

export default prisma;
