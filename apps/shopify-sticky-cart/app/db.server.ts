import { PrismaClient } from '@prisma/client';

const databaseUrl = process.env.DATABASE_URL ?? '';

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for Klyna Shopify apps.');
}

if (!databaseUrl.startsWith('postgresql://') && !databaseUrl.startsWith('postgres://')) {
  throw new Error('DATABASE_URL must be a Postgres connection string.');
}

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient | undefined;
}

const prisma: PrismaClient = global.prismaGlobal ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  global.prismaGlobal = prisma;
}

export default prisma;
