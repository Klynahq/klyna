import { type ActionFunctionArgs } from '@remix-run/node';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';
import { award, getProgram, upsertMember } from '../rewards.server';

// Fires on `customers/create`. Enrolls the new customer as a member and grants
// the one-time signup bonus.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  const customer = payload as {
    admin_graphql_api_id?: string;
    email?: string;
    first_name?: string;
    last_name?: string;
  };

  const customerGid = customer.admin_graphql_api_id;
  if (!customerGid) return new Response();

  const program = await getProgram(shop);
  if (!program.active) return new Response();

  const displayName = [customer.first_name, customer.last_name]
    .filter(Boolean)
    .join(' ')
    .trim();

  const member = await upsertMember({
    shop,
    customerId: customerGid,
    email: customer.email ?? null,
    displayName: displayName || null,
  });

  // Only grant the signup bonus once — guard on an existing SIGNUP ledger row.
  const granted = await prisma.pointsEvent.findFirst({
    where: { shop, memberId: member.id, reason: 'SIGNUP' },
  });
  if (!granted && program.pointsPerSignup > 0) {
    await award({
      shop,
      memberId: member.id,
      amount: program.pointsPerSignup,
      reason: 'SIGNUP',
      note: 'Account created',
    });
  }

  return new Response();
};
