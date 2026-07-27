import prisma from '../db.server';

export const FREE_REVIEW_LIMIT = 50;

export type PlanHandle = 'free' | 'growth';

function normalizePlanHandle(value: string | null): PlanHandle | null {
  return value === 'growth' || value === 'free' ? value : null;
}

export async function syncPlanFromRequest(shop: string, request: Request): Promise<PlanHandle> {
  const selectedPlan = normalizePlanHandle(new URL(request.url).searchParams.get('plan_handle'));

  if (selectedPlan) {
    await prisma.settings.upsert({
      where: { shop },
      create: { shop, planHandle: selectedPlan },
      update: { planHandle: selectedPlan },
    });
    return selectedPlan;
  }

  return getShopPlan(shop);
}

export async function getShopPlan(shop: string): Promise<PlanHandle> {
  const settings = await prisma.settings.findUnique({
    where: { shop },
    select: { planHandle: true },
  });

  return normalizePlanHandle(settings?.planHandle ?? null) ?? 'free';
}

export function planSelectionUrl(shop: string): string {
  const storeHandle = shop.replace(/\.myshopify\.com$/i, '');
  return `https://admin.shopify.com/store/${storeHandle}/charges/klyna-reviews/pricing_plans`;
}
