// Klyna for Shopify — Prisma client (Postgres).
//
// Tables are synced by explicit setup/migration commands, not during the
// Vercel build. At runtime we only open a connection, so set:
//   DATABASE_URL  — pooled connection string (serverless-safe, used here)
//   DIRECT_URL    — direct connection (used by Prisma setup/migration commands)
// Use any free Postgres (Neon / Supabase / Vercel Postgres).
import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient | undefined;
}

const prisma: PrismaClient = global.prismaGlobal ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  global.prismaGlobal = prisma;
}

export default prisma;
