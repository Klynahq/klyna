import { type ActionFunctionArgs } from '@remix-run/node';
import { authenticate } from '../shopify.server';
import { generateRecoverLine, type CartLineSnapshot } from '../lib/recover.server';
import { getSettings } from '../models/settings.server';

// POST /apps/sticky-cart/recover  (signed App Proxy)
//
// The storefront posts a small JSON body with the current cart and the
// shopper's visit count. We return a single line under 60 chars to render at
// the top of the sticky cart widget. AI provider must be configured in
// Settings > AI assistant; otherwise we return an empty line and the widget
// skips the banner.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);
  const shop = session?.shop;
  if (!shop) return jsonResponse({ ok: false }, 401);

  let payload: {
    lines?: unknown;
    cartTotal?: unknown;
    visitCount?: unknown;
    currency?: unknown;
  };
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'invalid_json' }, 400);
  }

  const lines = parseLines(payload.lines);
  const cartTotal =
    typeof payload.cartTotal === 'number' && Number.isFinite(payload.cartTotal)
      ? payload.cartTotal
      : 0;
  const visitCount =
    typeof payload.visitCount === 'number' && Number.isFinite(payload.visitCount)
      ? Math.max(1, Math.floor(payload.visitCount))
      : 1;
  const currency = typeof payload.currency === 'string' ? payload.currency : undefined;

  const settings = await getSettings(shop);
  const result = await generateRecoverLine({
    shop,
    lines,
    cartTotal,
    visitCount,
    freeShipThreshold: settings.freeShipEnabled ? settings.freeShipThreshold : 0,
    currency,
  });

  return jsonResponse({
    ok: !result.error,
    message: result.message,
    angle: result.angle,
    cached: result.cached,
    error: result.error,
  }, 200);
};

export const loader = () => jsonResponse({ ok: false, error: 'method_not_allowed' }, 405);

function parseLines(value: unknown): CartLineSnapshot[] {
  if (!Array.isArray(value)) return [];
  const out: CartLineSnapshot[] = [];
  for (const raw of value.slice(0, 10)) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    out.push({
      title: typeof r.title === 'string' ? r.title.slice(0, 80) : undefined,
      quantity: typeof r.quantity === 'number' ? r.quantity : undefined,
      price: typeof r.price === 'number' ? r.price : undefined,
    });
  }
  return out;
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
