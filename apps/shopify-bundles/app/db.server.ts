// KLYNA_SQLITE_BOOTSTRAP — ephemeral SQLite at /tmp for serverless.
// On cold start, create the schema if the .sqlite file does not yet exist.
// Swap to a real Postgres later by:
//   1. setting DATABASE_URL to a postgres:// URL in env
//   2. flipping prisma/schema.prisma datasource provider to "postgresql"
import { existsSync, copyFileSync } from "node:fs";
import { execSync } from "node:child_process";

const SQLITE_PATH = "/tmp/dev.sqlite";
if (!process.env.DATABASE_URL || process.env.DATABASE_URL === "") {
  process.env.DATABASE_URL = "file:" + SQLITE_PATH;
}
if (process.env.DATABASE_URL.startsWith("file:") && !existsSync(SQLITE_PATH)) {
  try {
    // prisma binary is bundled into the Vercel function via node_modules/.bin
    execSync(`./node_modules/.bin/prisma db push --skip-generate --accept-data-loss`, {
      stdio: "ignore",
      env: { ...process.env, DATABASE_URL: "file:" + SQLITE_PATH },
    });
  } catch (e) {
    console.error("[klyna] sqlite bootstrap failed", e);
  }
}

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
