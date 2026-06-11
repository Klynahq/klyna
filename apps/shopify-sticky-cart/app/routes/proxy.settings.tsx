import { type LoaderFunctionArgs } from '@remix-run/node';
import { authenticate } from '../shopify.server';
import { readSettings, serializeForStorefront } from '../models/settings.server';

// GET /apps/sticky-cart/settings  (signed App Proxy)
//
// The theme app extension calls this on the product page to load live widget
// config. Requests are HMAC-verified by `authenticate.public.appProxy`, so we
// can trust `session.shop` without any storefront token.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);
  const shop = session?.shop;

  if (!shop) {
    return new Response(JSON.stringify({ enabled: false }), {
      status: 200,
      headers: jsonHeaders(),
    });
  }

  const settings = await readSettings(shop);
  return new Response(JSON.stringify(serializeForStorefront(settings)), {
    status: 200,
    headers: jsonHeaders(),
  });
};

function jsonHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    // Short edge cache — settings change rarely, the storefront polls on load.
    'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
  };
}
