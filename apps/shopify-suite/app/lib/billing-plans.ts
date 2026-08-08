export const PRO_PLAN = 'Pro';
export const LEGACY_STARTER_PLAN = 'starter';

export const BILLING_PLAN_NAMES = [PRO_PLAN, LEGACY_STARTER_PLAN] as const;
export const PUBLIC_BILLING_PLAN_NAMES = [PRO_PLAN] as const;

export type PublicBillingPlanName = (typeof PUBLIC_BILLING_PLAN_NAMES)[number];

export interface PublicBillingPlan {
  name: PublicBillingPlanName;
  price: number;
  priceLabel: string;
  summary: string;
  cta: string;
  features: string[];
}

function readPrice(envName: string, fallback: number) {
  const value = Number(process.env[envName]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function proPrice() {
  return readPrice('KLYNA_PRO_PRICE', readPrice('KLYNA_MONTHLY_PRICE', 9));
}

export function planPrice(planName: (typeof BILLING_PLAN_NAMES)[number]) {
  return proPrice();
}

export function normalizeBillingPlanName(planName?: string | null): PublicBillingPlanName | null {
  if (!planName) return null;
  const normalized = planName.trim().toLowerCase();

  if (normalized === 'pro' || normalized.includes('pro plan')) {
    return PRO_PLAN;
  }

  if (normalized === 'starter' || normalized.includes('starter plan')) {
    return PRO_PLAN;
  }

  return null;
}

export function parseRequestedPlan(value: FormDataEntryValue | null): PublicBillingPlanName {
  return normalizeBillingPlanName(typeof value === 'string' ? value : null) ?? PRO_PLAN;
}

export function publicBillingPlans(): PublicBillingPlan[] {
  const pro = proPrice();

  return [
    {
      name: PRO_PLAN,
      price: pro,
      priceLabel: `$${pro}/month`,
      summary: 'Monitoring and exports for teams that run checks repeatedly.',
      cta: 'Start Pro trial',
      features: [
        'Everything in Free',
        'Saved monitoring workflow',
        'Priority fix queue and exports',
      ],
    },
  ];
}
