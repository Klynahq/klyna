export const STARTER_PLAN = 'Starter';
export const PRO_PLAN = 'Pro';
export const LEGACY_STARTER_PLAN = 'starter';

export const BILLING_PLAN_NAMES = [STARTER_PLAN, PRO_PLAN, LEGACY_STARTER_PLAN] as const;
export const PUBLIC_BILLING_PLAN_NAMES = [STARTER_PLAN, PRO_PLAN] as const;

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

export function starterPrice() {
  return readPrice('KLYNA_STARTER_PRICE', readPrice('KLYNA_MONTHLY_PRICE', 9));
}

export function proPrice() {
  return readPrice('KLYNA_PRO_PRICE', 19);
}

export function planPrice(planName: (typeof BILLING_PLAN_NAMES)[number]) {
  return planName === PRO_PLAN ? proPrice() : starterPrice();
}

export function normalizeBillingPlanName(planName?: string | null): PublicBillingPlanName | null {
  if (!planName) return null;
  const normalized = planName.trim().toLowerCase();

  if (normalized === 'pro' || normalized.includes('pro plan')) {
    return PRO_PLAN;
  }

  if (normalized === 'starter' || normalized.includes('starter plan')) {
    return STARTER_PLAN;
  }

  return null;
}

export function parseRequestedPlan(value: FormDataEntryValue | null): PublicBillingPlanName {
  return normalizeBillingPlanName(typeof value === 'string' ? value : null) ?? STARTER_PLAN;
}

export function publicBillingPlans(): PublicBillingPlan[] {
  const starter = starterPrice();
  const pro = proPrice();

  return [
    {
      name: STARTER_PLAN,
      price: starter,
      priceLabel: `$${starter}/month`,
      summary: 'Core diagnostics for one store workflow.',
      cta: 'Start Starter trial',
      features: [
        'Current scan dashboard',
        'Finding details and evidence',
        'Scan history for review handoff',
      ],
    },
    {
      name: PRO_PLAN,
      price: pro,
      priceLabel: `$${pro}/month`,
      summary: 'Monitoring and exports for teams that run checks repeatedly.',
      cta: 'Start Pro trial',
      features: [
        'Everything in Starter',
        'Saved monitoring workflow',
        'Priority fix queue and exports',
      ],
    },
  ];
}
