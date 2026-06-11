import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from '@remix-run/node';
import { json, redirect } from '@remix-run/node';
import { Form, useActionData, useLoaderData, useNavigation } from '@remix-run/react';
import { Button, Card, Label, PageHeader, TextInput } from '~/components/ui';
import { prisma } from '~/lib/db.server';
import { env, isAdminEmail } from '~/lib/env.server';
import { randomToken } from '~/lib/crypto.server';
import { sendEmail } from '~/lib/email.server';
import { getAdmin } from '~/lib/session.server';
import { clientIp, rateLimit } from '~/lib/rate-limit.server';

export const meta: MetaFunction = () => [{ title: 'Sign in — Klyna Admin' }];

export async function loader({ request }: LoaderFunctionArgs) {
  const admin = await getAdmin(request);
  if (admin) throw redirect('/admin');
  const url = new URL(request.url);
  return json({ next: url.searchParams.get('next') ?? '/admin' });
}

type ActionData =
  | { ok: true; message: string }
  | { ok: false; error: string };

export async function action({ request }: ActionFunctionArgs): Promise<Response> {
  const ip = clientIp(request);
  if (!rateLimit(`login:${ip}`, { capacity: 5, refillPerSec: 5 / 60 })) {
    await prisma.authEvent.create({
      data: { kind: 'rate_limited', ip, detail: 'login form' },
    });
    return json<ActionData>({ ok: false, error: 'Too many attempts. Try again in a minute.' }, { status: 429 });
  }
  const form = await request.formData();
  const email = String(form.get('email') ?? '').trim().toLowerCase();
  const next = String(form.get('next') ?? '/admin');

  // Always respond with the same generic message; never disclose whether email is allowed.
  const generic: ActionData = {
    ok: true,
    message: 'If that address is allowed, a sign-in link is on its way.',
  };

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json<ActionData>({ ok: false, error: 'Enter a valid email.' }, { status: 400 });
  }
  if (!isAdminEmail(email)) {
    await prisma.authEvent.create({
      data: { kind: 'login_fail', email, ip, detail: 'not in allowlist' },
    });
    return json(generic);
  }

  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  await prisma.magicLink.create({
    data: { email, token, expiresAt, ip },
  });
  const url = `${env.APP_URL}/admin/auth/verify?token=${encodeURIComponent(token)}&next=${encodeURIComponent(next)}`;
  await sendEmail({
    to: email,
    subject: 'Your Klyna admin sign-in link',
    text: `Sign in to Klyna Admin:\n\n${url}\n\nThis link expires in 15 minutes. If you didn't request it, you can ignore this email.`,
  });
  await prisma.authEvent.create({ data: { kind: 'magic_issued', email, ip } });
  if (!env.RESEND_API_KEY) {
    console.log(`[admin] Magic link for ${email}: ${url}`);
  }
  return json(generic);
}

export default function LoginPage() {
  const { next } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const busy = nav.state !== 'idle';
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <div className="mb-8 flex items-center gap-2">
        <span
          aria-hidden
          className="inline-block h-7 w-7 rounded-md"
          style={{
            background: 'linear-gradient(135deg, #7c5cff 0%, #9277ff 100%)',
          }}
        />
        <span className="text-lg font-semibold">Klyna Admin</span>
      </div>
      <PageHeader title="Sign in" description="We email you a one-time link. No passwords." />
      <Card>
        <Form method="post" className="space-y-4">
          <input type="hidden" name="next" value={next} />
          <div>
            <Label htmlFor="email">Email</Label>
            <TextInput
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@klyna.dev"
            />
          </div>
          <Button type="submit" disabled={busy}>
            {busy ? 'Sending…' : 'Send sign-in link'}
          </Button>
          {actionData && actionData.ok ? (
            <p className="text-sm text-[var(--color-success)]">{actionData.message}</p>
          ) : null}
          {actionData && !actionData.ok ? (
            <p className="text-sm text-[var(--color-danger)]">{actionData.error}</p>
          ) : null}
        </Form>
      </Card>
      <p className="mt-6 text-xs text-[var(--color-dim)]">
        Access restricted to authorized operators. Attempts are logged.
      </p>
    </main>
  );
}
