import { type ActionFunctionArgs } from '@remix-run/node';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';
import { award, getProgram, pointsForOrder, resolveTier, upsertMember } from '../rewards.server';

// Fires on `orders/paid`. Awards order points to the customer's member record
// and converts any pending referral tied to that customer's first order.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  const order = payload as {
    admin_graphql_api_id?: string;
    customer?: {
      admin_graphql_api_id?: string;
      email?: string;
      first_name?: string;
      last_name?: string;
    };
    current_subtotal_price?: string;
    subtotal_price?: string;
    note_attributes?: { name: string; value: string }[];
  };

  const customerGid = order.customer?.admin_graphql_api_id;
  if (!customerGid) return new Response();

  const program = await getProgram(shop);
  if (!program.active) return new Response();

  const subtotal = Number(order.current_subtotal_price ?? order.subtotal_price ?? 0);
  const displayName = [order.customer?.first_name, order.customer?.last_name]
    .filter(Boolean)
    .join(' ')
    .trim();

  const member = await upsertMember({
    shop,
    customerId: customerGid,
    email: order.customer?.email ?? null,
    displayName: displayName || null,
  });

  const tier = resolveTier(program.tiers, member.lifetime);
  const earned = pointsForOrder(program, tier, subtotal);
  if (earned > 0) {
    await award({
      shop,
      memberId: member.id,
      amount: earned,
      reason: 'ORDER',
      note: `Order subtotal ${program.currencyCode} ${subtotal.toFixed(2)}`,
      orderId: order.admin_graphql_api_id,
    });
  }

  // Referral conversion: the storefront widget stamps the referrer's code onto
  // the order as a note attribute (`klyna_ref`). On the first converting order
  // we reward the advocate and mark the referral CONVERTED.
  const refCode = order.note_attributes?.find((a) => a.name === 'klyna_ref')?.value;
  if (refCode) {
    await convertReferral(shop, refCode, order.customer?.email ?? null);
  }

  return new Response();
};

async function convertReferral(shop: string, code: string, refereeEmail: string | null) {
  const referrer = await prisma.member.findFirst({ where: { shop, referralCode: code } });
  if (!referrer) return;

  // Idempotency: don't double-reward the same referee email.
  const already = await prisma.referral.findFirst({
    where: { shop, referrerId: referrer.id, refereeEmail, status: 'CONVERTED' },
  });
  if (already) return;

  const program = await getProgram(shop);
  const reward = program.pointsPerReferral;

  await prisma.referral.create({
    data: {
      shop,
      referrerId: referrer.id,
      code,
      refereeEmail,
      status: 'CONVERTED',
      convertedAt: new Date(),
      rewardPoints: reward,
    },
  });

  if (reward > 0) {
    await award({
      shop,
      memberId: referrer.id,
      amount: reward,
      reason: 'REFERRAL',
      note: `Referral converted${refereeEmail ? ` (${refereeEmail})` : ''}`,
    });
  }
}
