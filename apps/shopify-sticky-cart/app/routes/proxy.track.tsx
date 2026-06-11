import { type ActionFunctionArgs } from '@remix-run/node';
import { authenticate } from '../shopify.server';
import { isTrackedEvent, recordEvent } from '../models/analytics.server';

// POST /apps/sticky-cart/track  (signed App Proxy)
//
// The storefront posts a tiny JSON body — { event, productId?, variantId?,
// cartValue? } — for each tracked interaction. HMAC verification gives us the
// trusted shop; we drop anything that isn't a known event so the storefront
// can't write arbitrary rows.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);
  const shop = session?.shop;

  if (!shop) {
    return jsonResponse({ ok: false }, 401);
  }

  let payload: {
    event?: unknown;
    productId?: unknown;
    variantId?: unknown;
    cartValue?: unknown;
  };
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'invalid_json' }, 400);
  }

  const event = String(payload.event ?? '');
  if (!isTrackedEvent(event)) {
    return jsonResponse({ ok: false, error: 'unknown_event' }, 400);
  }

  const cartValue =
    typeof payload.cartValue === 'number' && Number.isFinite(payload.cartValue)
      ? payload.cartValue
      : null;

  await recordEvent({
    shop,
    event,
    productId: cleanId(payload.productId),
    variantId: cleanId(payload.variantId),
    cartValue,
  });

  return jsonResponse({ ok: true }, 200);
};

// GET on this route returns a 405 — tracking is POST-only.
export const loader = () => jsonResponse({ ok: false, error: 'method_not_allowed' }, 405);

function cleanId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  // Accept either a raw numeric id or a Shopify GID; store the numeric tail.
  const tail = trimmed.split('/').pop() ?? trimmed;
  return /^\d+$/.test(tail) ? tail : null;
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
