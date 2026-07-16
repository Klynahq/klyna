import prisma from '../db.server';

export type PlanKey = 'starter' | 'growth' | 'pro';

export interface PlanAccess {
  key: PlanKey;
  label: string;
  rawHandle: string | null;
  paid: boolean;
  maxBundles: number;
  maxVolumeProducts: number;
  canUseVolume: boolean;
  canUseSuggestions: boolean;
}

const PLAN_LIMITS: Record<PlanKey, Omit<PlanAccess, 'key' | 'rawHandle'>> = {
  starter: {
    label: 'Starter',
    paid: false,
    maxBundles: 1,
    maxVolumeProducts: 0,
    canUseVolume: false,
    canUseSuggestions: false,
  },
  growth: {
    label: 'Growth',
    paid: true,
    maxBundles: 25,
    maxVolumeProducts: 25,
    canUseVolume: true,
    canUseSuggestions: false,
  },
  pro: {
    label: 'Pro',
    paid: true,
    maxBundles: 250,
    maxVolumeProducts: 250,
    canUseVolume: true,
    canUseSuggestions: true,
  },
};

export function normalizePlanHandle(raw: string | null | undefined): PlanKey | null {
  if (!raw) return null;
  const handle = raw.trim().toLowerCase().replace(/_/g, '-');
  if (handle === 'pro') return 'pro';
  if (handle === 'growth') return 'growth';
  if (['starter', 'free-launch', 'free', 'launch'].includes(handle)) return 'starter';
  return null;
}

export function planDefinition(key: PlanKey, rawHandle: string | null = null): PlanAccess {
  return { key, rawHandle, ...PLAN_LIMITS[key] };
}

function planHandleFromRequest(request: Request): string | null {
  const url = new URL(request.url);
  return (
    url.searchParams.get('plan_handle') ??
    url.searchParams.get('plan') ??
    url.searchParams.get('planHandle')
  );
}

async function persistPlanFromRequest(shop: string, request: Request): Promise<PlanAccess | null> {
  const rawHandle = planHandleFromRequest(request);
  const key = normalizePlanHandle(rawHandle);
  if (!key) return null;

  await prisma.shopPlan.upsert({
    where: { shop },
    update: {
      handle: key,
      rawHandle,
      source: 'shopify_app_pricing_redirect',
      selectedAt: new Date(),
    },
    create: {
      shop,
      handle: key,
      rawHandle,
      source: 'shopify_app_pricing_redirect',
    },
  });

  return planDefinition(key, rawHandle);
}

export async function getShopPlan(shop: string, request?: Request): Promise<PlanAccess> {
  if (request) {
    const redirectedPlan = await persistPlanFromRequest(shop, request);
    if (redirectedPlan) return redirectedPlan;
  }

  const saved = await prisma.shopPlan.findUnique({ where: { shop } });
  const key = normalizePlanHandle(saved?.handle) ?? 'starter';
  return planDefinition(key, saved?.rawHandle ?? null);
}

export function getPlanSelectionUrl(shop: string): string {
  const storeHandle = shop.replace(/\.myshopify\.com$/i, '').split('.')[0];
  const appHandle = process.env.SHOPIFY_APP_HANDLE ?? 'klyna-bundles';
  return `https://admin.shopify.com/store/${storeHandle}/charges/${appHandle}/pricing_plans`;
}

export function planLimitMessage(plan: PlanAccess, feature: 'bundles' | 'volume'): string {
  if (feature === 'bundles') {
    return `${plan.label} includes ${plan.maxBundles} bundle. Upgrade to Growth or Pro for more bundles.`;
  }
  return `${plan.label} includes bundle drafts only. Upgrade to Growth or Pro to create quantity-break tiers.`;
}
