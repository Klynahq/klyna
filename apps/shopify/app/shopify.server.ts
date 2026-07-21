import '@shopify/shopify-app-remix/adapters/node';
import { ApiVersion, AppDistribution, shopifyApp } from '@shopify/shopify-app-remix/server';
import { PrismaSessionStorage } from '@shopify/shopify-app-session-storage-prisma';
import prisma from './db.server';

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY ?? '',
  apiSecretKey: process.env.SHOPIFY_API_SECRET ?? '',
  apiVersion: ApiVersion.July26,
  scopes: process.env.SCOPES?.split(','),
  appUrl: process.env.SHOPIFY_APP_URL ?? 'https://klyna.dev',
  authPathPrefix: '/auth',
  isEmbeddedApp: true,
  sessionStorage: new PrismaSessionStorage(prisma as never),
  distribution: AppDistribution.AppStore,
  future: {
    unstable_newEmbeddedAuthStrategy: true,
    expiringOfflineAccessTokens: true,
  },
});

export default shopify;
export const apiVersion = ApiVersion.July26;

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
