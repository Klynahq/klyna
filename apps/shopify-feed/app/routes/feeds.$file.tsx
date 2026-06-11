import { type LoaderFunctionArgs } from '@remix-run/node';
import prisma from '../db.server';

// Public feed delivery. The path is /feeds/<token>.<ext> where <ext> is xml|csv.
// We look up the feed by token (unguessable), serve its most recent generated
// snapshot, and never touch the Admin API on this path so channel crawlers get
// a fast, cacheable response. No session — the token is the auth.
export const loader = async ({ params }: LoaderFunctionArgs) => {
  const file = params.file ?? '';
  const match = /^([A-Za-z0-9_-]+)\.(xml|csv)$/.exec(file);
  if (!match) {
    return new Response('Not found', { status: 404 });
  }
  const token = match[1]!;

  const feed = await prisma.feed.findUnique({
    where: { token },
    include: { runs: { orderBy: { createdAt: 'desc' }, take: 1 } },
  });

  if (!feed || !feed.enabled) {
    return new Response('Feed not found', { status: 404 });
  }

  const run = feed.runs[0];
  if (!run || !run.body) {
    return new Response(
      'Feed has not been generated yet. Open the app and hit "Refresh now".',
      { status: 503, headers: { 'Retry-After': '600' } },
    );
  }

  const contentType =
    run.contentType === 'text/xml' ? 'application/xml; charset=utf-8' : 'text/csv; charset=utf-8';

  return new Response(run.body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      // Channels poll periodically; let them cache for 30 min.
      'Cache-Control': 'public, max-age=1800',
      'X-Klyna-Feed': feed.id,
      'X-Klyna-Items': String(run.includedCount),
      'X-Klyna-Generated': run.createdAt.toISOString(),
    },
  });
};
