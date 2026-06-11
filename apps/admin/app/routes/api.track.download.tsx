import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/node';
import { prisma } from '~/lib/db.server';
import { hashIp } from '~/lib/crypto.server';
import { clientIp } from '~/lib/rate-limit.server';
import {
  jsonResponse,
  parseJson,
  requireIngestSecret,
  requireRateLimit,
  validateSlugKind,
} from '~/lib/api.server';

export const loader = ({ request: _request }: LoaderFunctionArgs) =>
  jsonResponse({ error: 'method not allowed' }, { status: 405 });

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'method not allowed' }, { status: 405 });
  }
  const limited = requireRateLimit(request, 'track:download', 60);
  if (limited) return limited;
  const unauthorized = requireIngestSecret(request);
  if (unauthorized) return unauthorized;

  const body = await parseJson<{ slug?: string; kind?: string; country?: string }>(request);
  if (body instanceof Response) return body;
  const err = validateSlugKind(body);
  if (err) return jsonResponse({ error: err }, { status: 400 });
  const country = typeof body.country === 'string' && /^[A-Z]{2}$/.test(body.country) ? body.country : null;

  await prisma.downloadEvent.create({
    data: {
      slug: body.slug!,
      kind: body.kind!,
      ipHash: hashIp(clientIp(request)),
      country: country ?? undefined,
    },
  });
  return jsonResponse({ ok: true });
}
