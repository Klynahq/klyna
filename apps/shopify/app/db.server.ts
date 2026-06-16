// Klyna for Shopify — Prisma client (Postgres).
//
// Tables are created/synced at deploy time by `prisma db push` in the Vercel
// build (see vercel.json). At runtime we only open a connection, so set:
//   DATABASE_URL  — pooled connection string (serverless-safe, used here)
//   DIRECT_URL    — direct connection (used by `prisma db push` at build)
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
