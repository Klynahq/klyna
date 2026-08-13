export const PRO_PLAN = 'Pro';
export const LEGACY_STARTER_PLAN = 'starter';

export const BILLING_PLAN_NAMES = [PRO_PLAN, LEGACY_STARTER_PLAN] as const;
export const PUBLIC_BILLING_PLAN_NAMES = [PRO_PLAN] as const;

export type PublicBillingPlanName = (typeof PUBLIC_BILLING_PLAN_NAMES)[number];

type BillingSubscription = {
  id?: string | null;
  name?: string | null;
  status?: string | null;
  createdAt?: string | null;
  test?: boolean | null;
};

type BillingChecker = {
  check(input: {
    plans: Array<(typeof BILLING_PLAN_NAMES)[number]>;
    isTest: boolean;
  }): Promise<{
    hasActivePayment?: boolean;
    appSubscriptions?: BillingSubscription[];
  }>;
};

type AdminClient = {
  graphql(query: string, options?: { variables?: Record<string, unknown> }): Promise<Response>;
};

export interface ActiveBillingState {
  hasActivePayment: boolean;
  activePlan: PublicBillingPlanName | null;
  activeSubscriptionId: string | null;
  activeSubscriptionName: string | null;
}

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

  if (normalized === 'pro' || normalized.includes('pro')) {
    return PRO_PLAN;
  }

  if (normalized === 'starter' || normalized.includes('starter')) {
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

export async function getActiveBillingState(
  admin: AdminClient,
  billing: BillingChecker,
  isTest: boolean,
): Promise<ActiveBillingState> {
  const subscriptions: BillingSubscription[] = [];
  let hasActivePayment = false;

  try {
    const billingCheck = await billing.check({
      plans: [...BILLING_PLAN_NAMES],
      isTest,
    });

    hasActivePayment = Boolean(billingCheck.hasActivePayment);
    subscriptions.push(...(billingCheck.appSubscriptions ?? []));
  } catch (error) {
    console.error('Shopify billing.check failed; falling back to activeSubscriptions.', error);
  }

  try {
    subscriptions.push(...(await getCurrentAppSubscriptions(admin)));
  } catch (error) {
    console.error('Shopify activeSubscriptions lookup failed.', error);
  }

  const activeSubscription = pickActiveSubscription(subscriptions);
  const activePlan = normalizeBillingPlanName(activeSubscription?.name);

  return {
    hasActivePayment: Boolean(activeSubscription) || hasActivePayment,
    activePlan,
    activeSubscriptionId: activeSubscription?.id ?? null,
    activeSubscriptionName: activeSubscription?.name ?? null,
  };
}

async function getCurrentAppSubscriptions(admin: AdminClient): Promise<BillingSubscription[]> {
  const response = await admin.graphql(/* GraphQL */ `
    query KlynaCurrentAppBilling {
      currentAppInstallation {
        activeSubscriptions {
          id
          name
          status
          createdAt
          test
        }
      }
    }
  `);

  const payload = (await response.json()) as {
    data?: {
      currentAppInstallation?: {
        activeSubscriptions?: BillingSubscription[];
      } | null;
    };
    errors?: unknown;
  };

  if (!response.ok || payload.errors) {
    return [];
  }

  return payload.data?.currentAppInstallation?.activeSubscriptions ?? [];
}

function pickActiveSubscription(subscriptions: BillingSubscription[]) {
  return subscriptions
    .filter((subscription) => normalizeBillingPlanName(subscription.name))
    .filter((subscription) => {
      const status = subscription.status?.toUpperCase();
      return !status || status === 'ACTIVE';
    })
    .sort((a, b) => {
      return (
        subscriptionCreatedAtMillis(b) - subscriptionCreatedAtMillis(a) ||
        Number(isGraphqlSubscriptionId(b.id)) - Number(isGraphqlSubscriptionId(a.id))
      );
    })[0];
}

function subscriptionCreatedAtMillis(subscription: BillingSubscription) {
  const timestamp = Date.parse(subscription.createdAt ?? '');
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function isGraphqlSubscriptionId(id?: string | null) {
  return id?.startsWith('gid://shopify/AppSubscription/') ?? false;
}
