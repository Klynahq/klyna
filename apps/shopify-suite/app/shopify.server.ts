import '@shopify/shopify-app-remix/adapters/node';
import {
  ApiVersion,
  AppDistribution,
  BillingInterval,
  shopifyApp,
} from '@shopify/shopify-app-remix/server';
import prisma from './db.server';
import { LEGACY_STARTER_PLAN, PRO_PLAN, planPrice } from './lib/billing-plans';
import { ProductSessionStorage } from './lib/product-session-storage.server';

export { BILLING_PLAN_NAMES, LEGACY_STARTER_PLAN, PRO_PLAN } from './lib/billing-plans';

export function isBillingRequired() {
  return process.env.KLYNA_BILLING_REQUIRED !== 'false';
}

export function isBillingTest() {
  return process.env.SHOPIFY_BILLING_TEST === 'true' || process.env.NODE_ENV !== 'production';
}

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY ?? '',
  apiSecretKey: process.env.SHOPIFY_API_SECRET ?? '',
  apiVersion: ApiVersion.July26,
  scopes: process.env.SCOPES?.split(','),
  appUrl: process.env.SHOPIFY_APP_URL ?? 'https://klyna.dev',
  authPathPrefix: '/auth',
  sessionStorage: new ProductSessionStorage(prisma) as never,
  distribution: AppDistribution.AppStore,
  future: {
    unstable_newEmbeddedAuthStrategy: true,
    expiringOfflineAccessTokens: true,
  },
  billing: {
    [PRO_PLAN]: {
      lineItems: [
        {
          amount: planPrice(PRO_PLAN),
          currencyCode: 'USD',
          interval: BillingInterval.Every30Days,
        },
      ],
    },
    [LEGACY_STARTER_PLAN]: {
      lineItems: [
        {
          amount: planPrice(LEGACY_STARTER_PLAN),
          currencyCode: 'USD',
          interval: BillingInterval.Every30Days,
        },
      ],
    },
  },
});

export default shopify;
export const apiVersion = ApiVersion.July26;
export const addDocumentResponseHeaders: typeof shopify.addDocumentResponseHeaders =
  shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const login = shopify.login;
