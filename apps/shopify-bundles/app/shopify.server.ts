import '@shopify/shopify-app-remix/server/adapters/node';
import { type ApiVersion, AppDistribution, shopifyApp } from '@shopify/shopify-app-remix/server';
import { PrismaSessionStorage } from '@shopify/shopify-app-session-storage-prisma';
import prisma from './db.server';

const SHOPIFY_API_VERSION = '2026-04' as ApiVersion;

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY ?? '',
  apiSecretKey: process.env.SHOPIFY_API_SECRET ?? '',
  apiVersion: SHOPIFY_API_VERSION,
  scopes: process.env.SCOPES?.split(','),
  appUrl: process.env.SHOPIFY_APP_URL ?? 'https://klyna-bundles.vercel.app',
  authPathPrefix: '/auth',
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  future: {
    expiringOfflineAccessTokens: true,
    unstable_newEmbeddedAuthStrategy: true,
  },
});

export default shopify;
export const apiVersion = SHOPIFY_API_VERSION;

// Re-export the most common helpers behind opaque any-typed wrappers so
// callers do not pay the cost of TS trying to inline cross-package types.
// Each route imports these and uses them as-typed at the call site (Remix
// loader/action signatures are clear enough on their own).
export const addDocumentResponseHeaders: typeof shopify.addDocumentResponseHeaders =
  shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const login = shopify.login;

// The intentionally-unannotated re-exports below are typed via shopify's own
// types when imported from this module — they trip TS isolatedDeclarations.
// We expose them via the default export instead; routes can use
// `shopify.unauthenticated`, `shopify.registerWebhooks`, etc.
