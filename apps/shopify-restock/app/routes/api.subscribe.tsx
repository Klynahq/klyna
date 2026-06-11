import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/node';
import { recordSignup } from '../services/waitlist.server';

// Public storefront endpoint — the "Notify me" widget POSTs here.
//
// The Theme App Extension renders on the merchant's storefront, so this route
// is unauthenticated (no admin session) and CORS-enabled. We trust the `shop`
// field plus the variant/product gids the Liquid block injects from the
// {{ product }} / {{ variant }} objects — all server-validated before insert.
//
// In production you'd front this with a Shopify App Proxy (signed requests) for
// stronger origin guarantees; the handler is written so swapping to a proxy
// only changes how `shop` is resolved, not the body of recordSignup.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export const loader = async (_args: LoaderFunctionArgs) =>
  json({ ok: true }, { headers: CORS_HEADERS });

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== 'POST') {
    return json({ ok: false, error: 'Method not allowed' }, { status: 405, headers: CORS_HEADERS });
  }

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

  const shop = (body.shop ?? '').trim().toLowerCase();
  const variantId = (body.variantId ?? '').trim();
  const productId = (body.productId ?? '').trim();

  if (!shop.endsWith('.myshopify.com')) {
    return json({ ok: false, error: 'Invalid shop.' }, { status: 400, headers: CORS_HEADERS });
  }
  if (!variantId || !productId) {
    return json(
      { ok: false, error: 'Missing product or variant.' },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const channel = body.phone && !body.email ? 'SMS' : 'EMAIL';

  const result = await recordSignup({
    shop,
    variantId: normalizeGid(variantId, 'ProductVariant'),
    productId: normalizeGid(productId, 'Product'),
    productTitle: body.productTitle?.trim() || 'Product',
    variantTitle: body.variantTitle?.trim() || null,
    productHandle: body.productHandle?.trim() || null,
    channel,
    email: body.email ?? null,
    phone: body.phone ?? null,
    marketingConsent: body.consent === 'true' || body.consent === 'on',
    locale: body.locale ?? null,
    sourceUrl: body.sourceUrl ?? null,
  });

  if (!result.ok) {
    return json({ ok: false, error: result.error }, { status: 400, headers: CORS_HEADERS });
  }

  return json(
    { ok: true, alreadySubscribed: Boolean(result.alreadySubscribed) },
    { headers: CORS_HEADERS },
  );
};

/** Storefront Liquid usually injects raw numeric ids; coerce to a gid. */
function normalizeGid(value: string, kind: 'Product' | 'ProductVariant'): string {
  if (value.startsWith('gid://')) return value;
  return `gid://shopify/${kind}/${value}`;
}
