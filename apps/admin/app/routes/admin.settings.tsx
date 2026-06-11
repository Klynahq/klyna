import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/node';
import { json, redirect } from '@remix-run/node';
import { Form, useLoaderData } from '@remix-run/react';
import { Badge, Button, Card, CardTitle, Label, PageHeader, Textarea } from '~/components/ui';
import { prisma } from '~/lib/db.server';
import { env } from '~/lib/env.server';
import { csrfFor, requireAdmin, verifyCsrf } from '~/lib/session.server';

const SIGNATURE_KEY = 'reply_signature';

export async function loader({ request }: LoaderFunctionArgs) {
  const admin = await requireAdmin(request);
  const sig = await prisma.setting.findUnique({ where: { key: SIGNATURE_KEY } });
  return json({
    adminEmails: env.ADMIN_EMAILS,
    resendConfigured: Boolean(env.RESEND_API_KEY),
    ingestConfigured: Boolean(env.KLYNA_INGEST_SECRET),
    githubConfigured: Boolean(env.GITHUB_TOKEN && env.GITHUB_REPO),
    signature: sig?.value ?? '',
    csrf: csrfFor(admin),
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const admin = await requireAdmin(request);
  const form = await request.formData();
  if (!verifyCsrf(admin, String(form.get('csrf') ?? ''))) {
    throw new Response('CSRF check failed', { status: 403 });
  }
  const signature = String(form.get('signature') ?? '');
  await prisma.setting.upsert({
    where: { key: SIGNATURE_KEY },
    update: { value: signature },
    create: { key: SIGNATURE_KEY, value: signature },
  });
  return redirect('/admin/settings');
}

export default function Settings() {
  const data = useLoaderData<typeof loader>();
  return (
    <>
      <PageHeader title="Settings" description="Read-only environment status plus a few editable knobs." />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardTitle>Allowed admin emails</CardTitle>
          <p className="mt-2 text-xs text-[var(--color-muted)]">Configured via the <code>ADMIN_EMAILS</code> env var (comma-separated).</p>
          <ul className="mt-3 space-y-1 text-sm">
            {data.adminEmails.length === 0 ? (
              <li className="text-[var(--color-danger)]">No admins configured.</li>
            ) : (
              data.adminEmails.map((e) => (
                <li key={e} className="font-mono">{e}</li>
              ))
            )}
          </ul>
        </Card>
        <Card>
          <CardTitle>Integration status</CardTitle>
          <ul className="mt-3 space-y-2 text-sm">
            <li className="flex items-center justify-between">
              <span>Resend (email)</span>
              <Badge tone={data.resendConfigured ? 'success' : 'warning'}>
                {data.resendConfigured ? 'set' : 'not set'}
              </Badge>
            </li>
            <li className="flex items-center justify-between">
              <span>Ingest shared secret</span>
              <Badge tone={data.ingestConfigured ? 'success' : 'warning'}>
                {data.ingestConfigured ? 'set' : 'not set'}
              </Badge>
            </li>
            <li className="flex items-center justify-between">
              <span>GitHub issue sync</span>
              <Badge tone={data.githubConfigured ? 'success' : 'neutral'}>
                {data.githubConfigured ? 'set' : 'optional'}
              </Badge>
            </li>
          </ul>
        </Card>
        <Card className="md:col-span-2">
          <CardTitle>Reply signature</CardTitle>
          <Form method="post" className="mt-3 space-y-3">
            <input type="hidden" name="csrf" value={data.csrf} />
            <div>
              <Label htmlFor="signature">Appended to manual replies (not yet auto-applied).</Label>
              <Textarea
                id="signature"
                name="signature"
                rows={4}
                defaultValue={data.signature}
                placeholder="— Adnan, Klyna"
              />
            </div>
            <Button type="submit">Save</Button>
          </Form>
        </Card>
      </div>
    </>
  );
}
