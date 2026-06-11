import { type LoaderFunctionArgs, json } from '@remix-run/node';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';
import { getProgram, resolveTier } from '../rewards.server';

// App-proxy endpoint backing the storefront widget.
//
// Storefront requests `/apps/rewards/widget/state?logged_in_customer_id=…`;
// Shopify signs the request and forwards it here. We return the program rules
// plus, for a logged-in customer, their balance, tier, and referral code.
//
// CORS-free: served same-origin through the proxy, so the theme block can
// `fetch` it directly with credentials.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);

  // The proxy request is signed by Shopify; guard the shop before serving data.
  const shop = session?.shop;
  if (!shop) {
    return json({ enrolled: false, error: 'no_shop' }, { status: 200 });
  }

  const url = new URL(request.url);
  const customerId = url.searchParams.get('logged_in_customer_id');
  const program = await getProgram(shop);

  const base = {
    programName: program.programName,
    active: program.active,
    currencyCode: program.currencyCode,
    pointsPerDollar: program.pointsPerDollar,
    pointsPerSignup: program.pointsPerSignup,
    pointsPerReferral: program.pointsPerReferral,
    redeemPoints: program.redeemPoints,
    redeemValue: program.redeemValue,
    refereeDiscountPct: program.refereeDiscountPct,
    tiers: program.tiers
      .slice()
      .sort((a, b) => a.threshold - b.threshold)
      .map((t) => ({ name: t.name, threshold: t.threshold, perkText: t.perkText, color: t.color })),
  };

  if (!customerId) {
    return json({ enrolled: false, program: base }, { status: 200 });
  }

  const customerGid = `gid://shopify/Customer/${customerId}`;
  const member = await prisma.member.findUnique({
    where: { shop_customerId: { shop, customerId: customerGid } },
  });

  if (!member) {
    return json({ enrolled: false, program: base }, { status: 200 });
  }

  const tier = resolveTier(program.tiers, member.lifetime);
  const sorted = program.tiers.slice().sort((a, b) => a.threshold - b.threshold);
  const next = sorted.find((t) => t.threshold > member.lifetime) ?? null;

  return json(
    {
      enrolled: true,
      program: base,
      member: {
        balance: member.balance,
        lifetime: member.lifetime,
        tier: tier?.name ?? '',
        referralCode: member.referralCode,
        redeemable: Math.floor(member.balance / program.redeemPoints),
        nextTier: next ? { name: next.name, threshold: next.threshold, remaining: next.threshold - member.lifetime } : null,
      },
    },
    { status: 200 },
  );
};
