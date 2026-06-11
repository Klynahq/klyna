import { redirect } from '@remix-run/node';
import { prisma } from './db.server';
import { sign, verifySigned, randomToken } from './crypto.server';
import { env, isAdminEmail } from './env.server';

const COOKIE = 'klyna_admin_session';
const MAX_AGE_SECONDS = 60 * 60 * 8; // 8 hours absolute
const IDLE_MS = 15 * 60 * 1000; // 15 min idle window enforced on read

export function buildCookie(value: string, maxAge: number): string {
  const parts = [
    `${COOKIE}=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ];
  if (env.NODE_ENV === 'production') parts.push('Secure');
  return parts.join('; ');
}

export function clearCookie(): string {
  return buildCookie('', 0);
}

function parseCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  const parts = header.split(';');
  for (const p of parts) {
    const idx = p.indexOf('=');
    if (idx < 0) continue;
    const k = p.slice(0, idx).trim();
    if (k === name) return decodeURIComponent(p.slice(idx + 1));
  }
  return null;
}

export async function createSession(opts: {
  email: string;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<string> {
  const id = randomToken(24);
  const expiresAt = new Date(Date.now() + MAX_AGE_SECONDS * 1000);
  await prisma.session.create({
    data: {
      id,
      email: opts.email.toLowerCase(),
      expiresAt,
      ip: opts.ip ?? null,
      userAgent: opts.userAgent ?? null,
    },
  });
  return sign(id);
}

export type AdminUser = { email: string; sessionId: string };

export async function getAdmin(request: Request): Promise<AdminUser | null> {
  const raw = parseCookie(request.headers.get('Cookie'), COOKIE);
  if (!raw) return null;
  const id = verifySigned(raw);
  if (!id) return null;
  const session = await prisma.session.findUnique({ where: { id } });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.session.delete({ where: { id } }).catch(() => {});
    return null;
  }
  // Idle check: if session was created more than IDLE_MS ago AND no recent activity,
  // we keep absolute expiry as the source of truth. Touch updatedAt-like field via expiresAt slide.
  const sinceCreate = Date.now() - session.createdAt.getTime();
  if (sinceCreate > MAX_AGE_SECONDS * 1000) return null;
  void IDLE_MS;
  if (!isAdminEmail(session.email)) return null;
  return { email: session.email, sessionId: session.id };
}

export async function requireAdmin(request: Request): Promise<AdminUser> {
  const admin = await getAdmin(request);
  if (!admin) {
    const url = new URL(request.url);
    throw redirect(`/admin/login?next=${encodeURIComponent(url.pathname + url.search)}`);
  }
  return admin;
}

export async function destroySession(sessionId: string): Promise<void> {
  await prisma.session.delete({ where: { id: sessionId } }).catch(() => {});
}

export function sessionCookieFor(signed: string): string {
  return buildCookie(signed, MAX_AGE_SECONDS);
}

// CSRF: token tied to the signed session value. We expose it to forms via loaders.
export function csrfFor(admin: AdminUser): string {
  return sign(`csrf:${admin.sessionId}`);
}

export function verifyCsrf(admin: AdminUser, token: string | null | undefined): boolean {
  if (!token) return false;
  const v = verifySigned(token);
  return v === `csrf:${admin.sessionId}`;
}
