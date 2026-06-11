// Klyna Rewards — domain logic.
//
// All point math, member upserts, tier resolution, and ledger writes live
// here so the Remix routes stay thin. Everything is shop-scoped; nothing
// here talks to the Shopify Admin API — routes pass the already-authenticated
// `admin` GraphQL client into the functions that need it.

import type { Member, Program, Tier } from '@prisma/client';
import prisma from './db.server';

const DEFAULT_TIERS = [
  { name: 'Bronze', threshold: 0, multiplier: 1.0, perkText: 'Earn 1× points on every order', color: '#a16207' },
  { name: 'Silver', threshold: 1000, multiplier: 1.25, perkText: '1.25× points + early access drops', color: '#71717a' },
  { name: 'Gold', threshold: 5000, multiplier: 1.5, perkText: '1.5× points + free shipping', color: '#fbbf24' },
] as const;

/**
 * Returns the shop's Program, creating it with default earning rules and a
 * starter set of tiers the first time it is requested.
 */
export async function getProgram(shop: string): Promise<Program & { tiers: Tier[] }> {
  const existing = await prisma.program.findUnique({
    where: { shop },
    include: { tiers: { orderBy: { threshold: 'asc' } } },
  });
  if (existing) return existing;

  await prisma.program.create({ data: { shop } });
  await prisma.tier.createMany({
    data: DEFAULT_TIERS.map((t) => ({ shop, ...t })),
  });

  // Re-read with the tiers attached.
  return prisma.program.findUniqueOrThrow({
    where: { shop },
    include: { tiers: { orderBy: { threshold: 'asc' } } },
  });
}

/** Generates a short, human-friendly, collision-resistant referral code. */
export function makeReferralCode(seed?: string): string {
  const base = (seed ?? '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${base || 'KLYNA'}-${rand}`;
}

/** Resolves which tier a lifetime point total falls into. */
export function resolveTier(tiers: Tier[], lifetime: number): Tier | null {
  const sorted = [...tiers].sort((a, b) => a.threshold - b.threshold);
  let current: Tier | null = null;
  for (const tier of sorted) {
    if (lifetime >= tier.threshold) current = tier;
  }
  return current;
}

/**
 * Finds an existing member by Shopify customer GID or creates one. Returns the
 * member; callers that just earned points should follow up with `award`.
 */
export async function upsertMember(params: {
  shop: string;
  customerId: string;
  email?: string | null;
  displayName?: string | null;
}): Promise<Member> {
  const { shop, customerId, email, displayName } = params;
  const found = await prisma.member.findUnique({
    where: { shop_customerId: { shop, customerId } },
  });
  if (found) {
    // Backfill contact details if they were unknown at creation time.
    if ((email && !found.email) || (displayName && !found.displayName)) {
      return prisma.member.update({
        where: { id: found.id },
        data: { email: email ?? found.email, displayName: displayName ?? found.displayName },
      });
    }
    return found;
  }

  // Ensure the program (and its tiers) exists before attaching a member.
  await getProgram(shop);
  return prisma.member.create({
    data: {
      shop,
      customerId,
      email: email ?? null,
      displayName: displayName ?? null,
      referralCode: makeReferralCode(email ?? displayName ?? undefined),
    },
  });
}

/**
 * Awards (or, with a negative amount, deducts) points for a member, writing a
 * ledger row and recomputing balance + lifetime + tier atomically.
 *
 * `lifetime` only ever increases — redemptions reduce `balance` but never the
 * lifetime total used for tier placement.
 */
export async function award(params: {
  shop: string;
  memberId: string;
  amount: number;
  reason: string;
  note?: string;
  orderId?: string;
}): Promise<Member> {
  const { shop, memberId, amount, reason, note, orderId } = params;

  return prisma.$transaction(async (tx) => {
    const member = await tx.member.findUniqueOrThrow({ where: { id: memberId } });
    const program = await tx.program.findUniqueOrThrow({
      where: { shop },
      include: { tiers: true },
    });

    const nextBalance = Math.max(0, member.balance + amount);
    const nextLifetime = amount > 0 ? member.lifetime + amount : member.lifetime;
    const tier = resolveTier(program.tiers, nextLifetime);

    await tx.pointsEvent.create({
      data: { shop, memberId, amount, reason, note: note ?? '', orderId: orderId ?? null },
    });

    return tx.member.update({
      where: { id: memberId },
      data: { balance: nextBalance, lifetime: nextLifetime, tierName: tier?.name ?? '' },
    });
  });
}

/**
 * Computes points earned for an order subtotal under the member's current tier
 * multiplier and the program's pointsPerDollar rule.
 */
export function pointsForOrder(program: Program, tier: Tier | null, subtotal: number): number {
  const base = Math.floor(subtotal) * program.pointsPerDollar;
  const mult = tier?.multiplier ?? 1;
  return Math.round(base * mult);
}
