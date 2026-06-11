import type { LoaderFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { Badge, Card, CardTitle, PageHeader, Table, Td, Th } from '~/components/ui';
import { prisma } from '~/lib/db.server';
import { requireAdmin } from '~/lib/session.server';

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdmin(request);
  const d7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [recentEvents, magicCount, failCount, rateLimited] = await Promise.all([
    prisma.authEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }),
    prisma.magicLink.count({ where: { createdAt: { gte: d7 } } }),
    prisma.authEvent.count({ where: { kind: 'login_fail', createdAt: { gte: d7 } } }),
    prisma.authEvent.count({ where: { kind: 'rate_limited', createdAt: { gte: d7 } } }),
  ]);
  return json({ recentEvents, magicCount, failCount, rateLimited });
}

function toneFor(kind: string) {
  if (kind === 'login_success') return 'success' as const;
  if (kind === 'login_fail' || kind === 'rate_limited') return 'danger' as const;
  if (kind === 'magic_issued' || kind === 'magic_consumed') return 'accent' as const;
  return 'neutral' as const;
}

export default function Security() {
  const { recentEvents, magicCount, failCount, rateLimited } = useLoaderData<typeof loader>();
  return (
    <>
      <PageHeader
        title="Security"
        description="Readonly view of auth activity."
      />
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardTitle>Magic links · 7d</CardTitle>
          <div className="mt-2 text-3xl font-semibold">{magicCount}</div>
        </Card>
        <Card>
          <CardTitle>Failed logins · 7d</CardTitle>
          <div className="mt-2 text-3xl font-semibold text-[var(--color-danger)]">{failCount}</div>
        </Card>
        <Card>
          <CardTitle>Rate-limit hits · 7d</CardTitle>
          <div className="mt-2 text-3xl font-semibold text-[var(--color-warning)]">{rateLimited}</div>
        </Card>
      </div>
      <Card>
        <CardTitle>Recent auth events</CardTitle>
        <div className="mt-3">
          <Table>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Kind</Th>
                <Th>Email</Th>
                <Th>IP</Th>
                <Th>Detail</Th>
              </tr>
            </thead>
            <tbody>
              {recentEvents.map((e) => (
                <tr key={e.id}>
                  <Td className="font-mono text-xs">{new Date(e.createdAt).toISOString()}</Td>
                  <Td>
                    <Badge tone={toneFor(e.kind)}>{e.kind}</Badge>
                  </Td>
                  <Td>{e.email ?? '—'}</Td>
                  <Td className="font-mono text-xs">{e.ip ?? '—'}</Td>
                  <Td className="text-xs text-[var(--color-muted)]">{e.detail ?? ''}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </Card>
    </>
  );
}
