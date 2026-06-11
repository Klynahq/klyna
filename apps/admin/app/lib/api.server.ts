import { env } from './env.server';
import { rateLimit, clientIp } from './rate-limit.server';

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...(init.headers ?? {}),
    },
  });
}

export function requireIngestSecret(request: Request): Response | null {
  if (!env.KLYNA_INGEST_SECRET) {
    return jsonResponse({ error: 'ingest disabled' }, { status: 503 });
  }
  const provided = request.headers.get('x-klyna-secret');
  if (provided !== env.KLYNA_INGEST_SECRET) {
    return jsonResponse({ error: 'unauthorized' }, { status: 401 });
  }
  return null;
}

export function requireRateLimit(
  request: Request,
  key: string,
  capacity = 60,
): Response | null {
  const ip = clientIp(request);
  if (!rateLimit(`${key}:${ip}`, { capacity, refillPerSec: capacity / 60 })) {
    return jsonResponse({ error: 'rate limited' }, { status: 429 });
  }
  return null;
}

export async function parseJson<T = Record<string, unknown>>(
  request: Request,
  maxBytes = 4096,
): Promise<T | Response> {
  const len = Number(request.headers.get('content-length') ?? '0');
  if (len > maxBytes) {
    return jsonResponse({ error: 'payload too large' }, { status: 413 });
  }
  try {
    const text = await request.text();
    if (text.length > maxBytes) {
      return jsonResponse({ error: 'payload too large' }, { status: 413 });
    }
    return JSON.parse(text) as T;
  } catch {
    return jsonResponse({ error: 'invalid json' }, { status: 400 });
  }
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,60}$/;
const KINDS = new Set(['wp', 'shopify', 'theme']);

export function validateSlugKind(body: { slug?: unknown; kind?: unknown }): string | null {
  if (typeof body.slug !== 'string' || !SLUG_RE.test(body.slug)) return 'invalid slug';
  if (typeof body.kind !== 'string' || !KINDS.has(body.kind)) return 'invalid kind';
  return null;
}
