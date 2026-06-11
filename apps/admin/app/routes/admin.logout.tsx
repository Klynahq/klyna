import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/node';
import { redirect } from '@remix-run/node';
import { prisma } from '~/lib/db.server';
import { clearCookie, destroySession, getAdmin, verifyCsrf, csrfFor } from '~/lib/session.server';

export async function action({ request }: ActionFunctionArgs) {
  const admin = await getAdmin(request);
  if (!admin) throw redirect('/admin/login');
  const form = await request.formData();
  const csrf = String(form.get('csrf') ?? '');
  // Recreate csrfFor on the existing admin and compare.
  if (csrf !== csrfFor(admin) && !verifyCsrf(admin, csrf)) {
    throw new Response('CSRF check failed', { status: 403 });
  }
  await destroySession(admin.sessionId);
  await prisma.authEvent.create({ data: { kind: 'logout', email: admin.email } });
  throw redirect('/admin/login', { headers: { 'Set-Cookie': clearCookie() } });
}

export const loader = ({ request: _request }: LoaderFunctionArgs) => redirect('/admin');
