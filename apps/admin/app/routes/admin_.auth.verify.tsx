import type { LoaderFunctionArgs } from '@remix-run/node';
import { redirect } from '@remix-run/node';
import { prisma } from '~/lib/db.server';
import { isAdminEmail } from '~/lib/env.server';
import { clientIp, rateLimit } from '~/lib/rate-limit.server';
import { createSession, sessionCookieFor } from '~/lib/session.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const ip = clientIp(request);
  if (!rateLimit(`verify:${ip}`, { capacity: 10, refillPerSec: 10 / 60 })) {
    throw new Response('Too many requests', { status: 429 });
  }
  const url = new URL(request.url);
  const token = url.searchParams.get('token') ?? '';
  const next = url.searchParams.get('next') ?? '/admin';
  if (!token) throw redirect('/admin/login');

  const link = await prisma.magicLink.findUnique({ where: { token } });
  if (!link || link.usedAt || link.expiresAt.getTime() < Date.now()) {
    await prisma.authEvent.create({
      data: { kind: 'login_fail', email: link?.email ?? null, ip, detail: 'invalid or expired token' },
    });
    throw redirect('/admin/login?error=expired');
  }
  if (!isAdminEmail(link.email)) {
    await prisma.authEvent.create({
      data: { kind: 'login_fail', email: link.email, ip, detail: 'allowlist removed' },
    });
    throw redirect('/admin/login?error=forbidden');
  }
  await prisma.magicLink.update({
    where: { token },
    data: { usedAt: new Date() },
  });
  const signed = await createSession({
    email: link.email,
    ip,
    userAgent: request.headers.get('user-agent') ?? null,
  });
  await prisma.authEvent.create({
    data: { kind: 'login_success', email: link.email, ip },
  });
  // Validate next is a local path.
  const safeNext = next.startsWith('/admin') ? next : '/admin';
  return redirect(safeNext, {
    headers: { 'Set-Cookie': sessionCookieFor(signed) },
  });
}
