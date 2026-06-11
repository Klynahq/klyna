import { type ActionFunctionArgs, json } from '@remix-run/node';
import { authenticate } from '../shopify.server';
import { recordEvent, type EventKind, type WidgetType } from '../lib/analytics.server';

// Public analytics beacon.
//
// The storefront blocks POST a tiny payload here (through the app proxy) when a
// widget is shown, clicked, or attributed a conversion. We roll the counts into
// the daily Impression buckets. Signature is verified by the app proxy helper.
const VALID_TYPES: WidgetType[] = ['timer', 'scarcity', 'proof'];
const VALID_KINDS: EventKind[] = ['view', 'click', 'conversion'];

export const action = async ({ request }: ActionFunctionArgs) => {
  const ctx = await authenticate.public.appProxy(request);
  const shop = ctx.session?.shop;
  const withCors = <T,>(res: T): T => res;
  if (!shop) {
    return withCors(json({ ok: false }, { status: 401 }));
  }

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    // Beacons may send urlencoded form data instead of JSON.
    const form = await request.formData().catch(() => null);
    if (form) body = Object.fromEntries(form.entries());
  }

  const widgetType = String(body.widgetType ?? '') as WidgetType;
  const kind = String(body.kind ?? '') as EventKind;

  if (!VALID_TYPES.includes(widgetType) || !VALID_KINDS.includes(kind)) {
    return withCors(json({ ok: false, error: 'bad event' }, { status: 400 }));
  }

  await recordEvent({
    shop,
    widgetType,
    kind,
    timerId: body.timerId ? String(body.timerId) : null,
    scarcityId: body.scarcityId ? String(body.scarcityId) : null,
  });

  return withCors(json({ ok: true }));
};
