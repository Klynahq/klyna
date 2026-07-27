import type { AdminGraphqlClient } from '@shopify/shopify-app-remix/server';
import prisma from '../db.server';

export const FREE_ACTIVE_SUBSCRIBER_LIMIT = 50;

export type PlanHandle = 'free' | 'growth';

const PARTNER_API_VERSION = '2026-07';
const PARTNER_ORGANIZATION_ID = process.env.SHOPIFY_PARTNER_ORGANIZATION_ID ?? '4980934';
const PARTNER_APP_ID = process.env.SHOPIFY_PARTNER_APP_ID ?? '380959227905';

interface PartnerSubscriptionResponse {
  data?: {
    activeSubscription?: {
      items: Array<{ handle: string; price?: { active?: boolean } | null }>;
    } | null;
  };
  errors?: Array<{ message: string }>;
}

/**
 * Refresh the merchant's entitlement after Shopify redirects back from plan
 * selection. The URL's plan_handle is only a refresh signal; it is never
 * trusted as proof of payment.
 */
export async function syncPlanFromRequest(
  shop: string,
  request: Request,
  admin: { graphql: AdminGraphqlClient },
): Promise<PlanHandle> {
  const forceRefresh = new URL(request.url).searchParams.has('plan_handle');
  return getShopPlan(shop, admin, forceRefresh);
}

/**
 * Resolve the canonical plan through Shopify App Pricing. A missing Partner
 * token, API error, or unverified shop always fails closed to the free plan.
 */
export async function getShopPlan(
  shop: string,
  admin?: { graphql: AdminGraphqlClient },
  _forceRefresh = false,
): Promise<PlanHandle> {
  const token = process.env.SHOPIFY_PARTNER_API_TOKEN;
  if (!token || !admin) return 'free';

  try {
    const shopResponse = await admin.graphql(`query KlynaBillingShop {
      shop { id }
    }`);
    const shopPayload = (await shopResponse.json()) as {
      data?: { shop?: { id?: string } };
    };
    const shopId = shopPayload.data?.shop?.id;
    if (!shopId) return 'free';

    const response = await fetch(
      `https://partners.shopify.com/${PARTNER_ORGANIZATION_ID}/api/${PARTNER_API_VERSION}/graphql.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': token,
        },
        body: JSON.stringify({
          query: `query KlynaActiveSubscription($appId: ID!, $shopId: ID!) {
            activeSubscription(appId: $appId, shopId: $shopId) {
              items {
                handle
                price {
                  active
                }
              }
            }
          }`,
          variables: {
            appId: `gid://shopify/App/${PARTNER_APP_ID}`,
            shopId,
          },
        }),
      },
    );

    if (!response.ok) return 'free';
    const payload = (await response.json()) as PartnerSubscriptionResponse;
    if (payload.errors?.length) return 'free';

    const plan: PlanHandle = payload.data?.activeSubscription?.items.some(
      (item) =>
        item.price?.active !== false &&
        ['growth', 'growth-test'].includes(item.handle),
    )
      ? 'growth'
      : 'free';

    await prisma.shopSettings.upsert({
      where: { shop },
      create: { shop, planHandle: plan },
      update: { planHandle: plan },
    });
    return plan;
  } catch {
    return 'free';
  }
}

export function planSelectionUrl(shop: string): string {
  const storeHandle = shop.replace(/\.myshopify\.com$/i, '');
  return `https://admin.shopify.com/store/${storeHandle}/charges/klyna-back-in-stock/pricing_plans`;
}
