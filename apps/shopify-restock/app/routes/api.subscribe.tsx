import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/node';
import { authenticate } from '../shopify.server';
import { recordSignup } from '../services/waitlist.server';

// Public storefront endpoint — the "Notify me" widget POSTs here through the
// Shopify App Proxy. The Theme App Extension fetches `/apps/klyna-restock`
// and Shopify forwards it server-to-server with a signed `shop` query param.
// We authenticate via `authenticate.public.appProxy` so the shop identity is
// asserted by Shopify, never trusted from the client body.
//
// CORS is not needed because App Proxy requests are same-origin from the
// storefront's perspective and server-to-server from Shopify's edge.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GID_RE = /^gid:\/\/shopify\/(Product|ProductVariant)\/\d+$/;
const NUMERIC_RE = /^\d+$/;

// Per-(shop,email) rate limit: max 5 subscribes per email per shop per hour.
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const rateLimit = new Map<string, number[]>();

function checkRateLimit(shop: string, email: string): boolean {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;

  // Prune stale entries across the map on each call to keep memory bounded.
  for (const [key, stamps] of rateLimit) {
    const kept = stamps.filter((t) => t > cutoff);
    if (kept.length === 0) {
      rateLimit.delete(key);
    } else if (kept.length !== stamps.length) {
      rateLimit.set(key, kept);
    }
  }

  const key = `${shop}|${email.toLowerCase()}`;
  const stamps = rateLimit.get(key) ?? [];
  if (stamps.length >= RATE_LIMIT_MAX) return false;
  stamps.push(now);
  rateLimit.set(key, stamps);
  return true;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // App Proxy GETs are used by Shopify for health probes; just confirm auth.
  await authenticate.public.appProxy(request);
  return json({ ok: true });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== 'POST') {
    return json({ ok: false, error: 'Method not allowed' }, { status: 405 });
  }

  const { session } = await authenticate.public.appProxy(request);
  if (!session) {
    return json({ ok: false, error: 'No session' }, { status: 401 });
  }
  const shop = session.shop;

  // Accept both form posts (no-JS fallback) and fetch JSON.
  let body: Record<string, string>;
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    body = (await request.json()) as Record<string, string>;
  } else {
    const form = await request.formData();
    body = Object.fromEntries(
      [...form.entries()].map(([k, v]) => [k, String(v)]),
    );
  }

  const variantIdRaw = (body.variantId ?? '').trim();
  const productIdRaw = (body.productId ?? '').trim();
  const email = (body.email ?? '').trim();
  const phone = (body.phone ?? '').trim();

  if (!variantIdRaw || !productIdRaw) {
    return json(
      { ok: false, error: 'Missing product or variant.' },
      { status: 400 },
    );
  }

  // Validate id shape: accept raw numeric id or a fully-formed gid.
  const variantOk =
    NUMERIC_RE.test(variantIdRaw) ||
    (GID_RE.test(variantIdRaw) && variantIdRaw.includes('/ProductVariant/'));
  const productOk =
    NUMERIC_RE.test(productIdRaw) ||
    (GID_RE.test(productIdRaw) && productIdRaw.includes('/Product/'));
  if (!variantOk || !productOk) {
    return json({ ok: false, error: 'Invalid product or variant id.' }, { status: 400 });
  }

  if (!email && !phone) {
    return json(
      { ok: false, error: 'Email or phone required.' },
      { status: 400 },
    );
  }
  if (email && !EMAIL_RE.test(email)) {
    return json({ ok: false, error: 'Invalid email.' }, { status: 400 });
  }

  // Rate limit by (shop, email-or-phone) to deter abuse.
  const rateKey = email || phone;
  if (!checkRateLimit(shop, rateKey)) {
    return json(
      { ok: false, error: 'Too many requests. Please try again later.' },
      { status: 429 },
    );
  }

  const channel = phone && !email ? 'SMS' : 'EMAIL';

  const result = await recordSignup({
    shop,
    variantId: normalizeGid(variantIdRaw, 'ProductVariant'),
    productId: normalizeGid(productIdRaw, 'Product'),
    productTitle: body.productTitle?.trim() || 'Product',
    variantTitle: body.variantTitle?.trim() || null,
    productHandle: body.productHandle?.trim() || null,
    channel,
    email: email || null,
    phone: phone || null,
    marketingConsent: body.consent === 'true' || body.consent === 'on',
    locale: body.locale ?? null,
    sourceUrl: body.sourceUrl ?? null,
  });

  if (!result.ok) {
    return json({ ok: false, error: result.error }, { status: 400 });
  }

  return json({ ok: true, alreadySubscribed: Boolean(result.alreadySubscribed) });
};

/** Storefront Liquid usually injects raw numeric ids; coerce to a gid. */
function normalizeGid(value: string, kind: 'Product' | 'ProductVariant'): string {
  if (value.startsWith('gid://')) return value;
  return `gid://shopify/${kind}/${value}`;
}
