import { type LoaderFunctionArgs, json } from '@remix-run/node';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';

// Public widget config endpoint.
//
// The theme app extension blocks fetch this (through the app proxy) on every
// storefront page load to learn which timers, scarcity rules, and social-proof
// settings are live. We keep the payload small and free of any admin-only data.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  // App-proxy requests are signed; `authenticate.public.appProxy` verifies the
  // HMAC and tells us which shop is calling.
  const { session, cors } = await authenticate.public.appProxy(request);
  const shop = session?.shop;

  if (!shop) {
    return cors(json({ timers: [], scarcity: [], socialProof: null }));
  }

  const [timers, scarcity, proof, proofEvents] = await Promise.all([
    prisma.countdownTimer.findMany({
      where: { shop, enabled: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.scarcityRule.findMany({
      where: { shop, enabled: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.socialProofConfig.findUnique({ where: { shop } }),
    prisma.proofEvent.findMany({
      where: { shop },
      orderBy: { purchasedAt: 'desc' },
      take: 30,
    }),
  ]);

  const now = Date.now();

  const payload = {
    timers: timers.map((t) => ({
      id: t.id,
      headline: t.headline,
      subtext: t.subtext,
      style: t.style,
      startsAt: t.startsAt?.toISOString() ?? null,
      endsAt: t.endsAt?.toISOString() ?? null,
      evergreenMinutes: t.evergreenMinutes,
      expireAction: t.expireAction,
      expireMessage: t.expireMessage,
      accentColor: t.accentColor,
      targeting: safeJson(t.targeting),
    })),
    scarcity: scarcity.map((s) => ({
      id: s.id,
      productGid: s.productGid,
      threshold: s.threshold,
      template: s.template,
      hideAtOrBelow: s.hideAtOrBelow,
      accentColor: s.accentColor,
    })),
    socialProof:
      proof && proof.enabled
        ? {
            source: proof.source,
            template: proof.template,
            position: proof.position,
            displaySeconds: proof.displaySeconds,
            intervalSeconds: proof.intervalSeconds,
            accentColor: proof.accentColor,
            events: proofEvents
              .filter((e) => now - e.purchasedAt.getTime() <= proof.maxAgeHours * 3_600_000)
              .map((e) => ({
                name: e.firstName,
                city: e.city,
                product: e.productTitle,
                ago: humanAgo(now - e.purchasedAt.getTime()),
              })),
          }
        : null,
  };

  return cors(json(payload));
};

function safeJson(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
}

function humanAgo(ms: number): string {
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${Math.max(1, mins)} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
