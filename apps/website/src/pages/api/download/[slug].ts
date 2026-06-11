import type { APIRoute } from 'astro';
import { products } from '@klyna/utils';

// Runs as a serverless function on Vercel — must opt out of prerender.
export const prerender = false;

// Build an allowlist from the canonical product catalog. Only products that
// publish a downloadUrl are tracked / redirectable.
const ALLOWED: Map<string, { slug: string; kind: 'wp' | 'shopify' | 'extension' | 'theme' | 'web' }> = new Map(
  products
    .filter((p) => !!p.downloadUrl)
    .map((p) => {
      // Map ProductSurface → tracking kind. The admin panel groups by `kind`.
      const kind =
        p.surface === 'wordpress'
          ? 'wp'
          : p.surface === 'shopify'
          ? 'shopify'
          : p.surface === 'extension'
          ? 'extension'
          : p.surface === 'theme'
          ? 'theme'
          : 'web';
      return [p.slug, { slug: p.slug, kind }] as const;
    }),
);

const ADMIN_URL = import.meta.env.KLYNA_ADMIN_URL || process.env.KLYNA_ADMIN_URL || 'http://localhost:3001';
const ADMIN_SECRET = import.meta.env.KLYNA_ADMIN_SECRET || process.env.KLYNA_ADMIN_SECRET || '';

/**
 * Fire-and-forget tracking ping. Wrapped so any failure (DNS, timeout, 500)
 * NEVER blocks the user's download.
 */
function trackDownload(slug: string, kind: string): void {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    fetch(`${ADMIN_URL}/api/track/download`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Klyna-Secret': ADMIN_SECRET,
      },
      body: JSON.stringify({ slug, kind }),
      signal: controller.signal,
    })
      .catch(() => {
        /* swallow */
      })
      .finally(() => clearTimeout(timer));
  } catch {
    /* swallow */
  }
}

export const GET: APIRoute = ({ params, redirect }) => {
  const slug = params.slug;
  if (!slug || !ALLOWED.has(slug)) {
    return new Response('Unknown product', { status: 404 });
  }
  const entry = ALLOWED.get(slug)!;
  trackDownload(entry.slug, entry.kind);
  // Redirect to the actual zip in /public/downloads/
  return redirect(`/downloads/${slug}.zip`, 302);
};
