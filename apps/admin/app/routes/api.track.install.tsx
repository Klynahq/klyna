import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/node';
import { prisma } from '~/lib/db.server';
import {
  jsonResponse,
  parseJson,
  requireIngestSecret,
  requireRateLimit,
  validateSlugKind,
} from '~/lib/api.server';

export const loader = ({ request: _request }: LoaderFunctionArgs) =>
  jsonResponse({ error: 'method not allowed' }, { status: 405 });

const VERSION_RE = /^[\w.+-]{1,32}$/;
const HOST_HASH_RE = /^[a-f0-9]{32,128}$/i;

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'method not allowed' }, { status: 405 });
  }
  const limited = requireRateLimit(request, 'track:install', 60);
  if (limited) return limited;
  const unauthorized = requireIngestSecret(request);
  if (unauthorized) return unauthorized;

  const body = await parseJson<{
    slug?: string;
    kind?: string;
    version?: string;
    hostHash?: string;
    wpVersion?: string;
    phpVersion?: string;
  }>(request, 2048);
  if (body instanceof Response) return body;
  const err = validateSlugKind(body);
  if (err) return jsonResponse({ error: err }, { status: 400 });
  if (typeof body.version !== 'string' || !VERSION_RE.test(body.version)) {
    return jsonResponse({ error: 'invalid version' }, { status: 400 });
  }
  if (typeof body.hostHash !== 'string' || !HOST_HASH_RE.test(body.hostHash)) {
    return jsonResponse({ error: 'invalid hostHash' }, { status: 400 });
  }
  const wpVersion =
    typeof body.wpVersion === 'string' && VERSION_RE.test(body.wpVersion) ? body.wpVersion : undefined;
  const phpVersion =
    typeof body.phpVersion === 'string' && VERSION_RE.test(body.phpVersion) ? body.phpVersion : undefined;

  await prisma.installPing.create({
    data: {
      slug: body.slug!,
      kind: body.kind!,
      version: body.version,
      hostHash: body.hostHash.toLowerCase(),
      wpVersion,
      phpVersion,
    },
  });
  return jsonResponse({ ok: true });
}
