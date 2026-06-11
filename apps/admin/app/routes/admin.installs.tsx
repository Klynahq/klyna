import type { LoaderFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { Badge, Card, CardTitle, EmptyState, PageHeader, Table, Td, Th } from '~/components/ui';
import { prisma } from '~/lib/db.server';
import { requireAdmin } from '~/lib/session.server';

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdmin(request);
  const d30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const pings = await prisma.installPing.findMany({
    where: { pingedAt: { gte: d30 } },
    orderBy: { pingedAt: 'desc' },
    take: 5000,
  });
  // Group by slug + version, count unique hostHash for active estimate.
  type Row = { slug: string; version: string; kind: string; hosts: Set<string>; latest: Date };
  const map = new Map<string, Row>();
  for (const p of pings) {
    const key = `${p.slug}|${p.version}|${p.kind}`;
    const existing = map.get(key) ?? {
      slug: p.slug,
      version: p.version,
      kind: p.kind,
      hosts: new Set<string>(),
      latest: p.pingedAt,
    };
    existing.hosts.add(p.hostHash);
    if (p.pingedAt > existing.latest) existing.latest = p.pingedAt;
    map.set(key, existing);
  }
  const grouped = [...map.values()]
    .map((r) => ({
      slug: r.slug,
      version: r.version,
      kind: r.kind,
      activeInstalls: r.hosts.size,
      latest: r.latest.toISOString(),
    }))
    .sort((a, b) => b.activeInstalls - a.activeInstalls);

  const totalActive = new Set(pings.map((p) => p.hostHash)).size;
  return json({ grouped, totalActive, sample: pings.slice(0, 50) });
}

export default function Installs() {
  const { grouped, totalActive, sample } = useLoaderData<typeof loader>();
  return (
    <>
      <PageHeader
        title="Installs"
        description="Anonymous install pings, last 30 days. One row per unique host hash counts as an active install."
        actions={<Badge tone="accent">{totalActive.toLocaleString()} active</Badge>}
      />
      {grouped.length === 0 ? (
        <EmptyState title="No install pings yet" description="Plugins call /api/track/install once a day per site." />
      ) : (
        <>
          <Card className="mb-6">
            <CardTitle>By product · version</CardTitle>
            <div className="mt-4">
              <Table>
                <thead>
                  <tr>
                    <Th>Product</Th>
                    <Th>Version</Th>
                    <Th>Kind</Th>
                    <Th>Active installs</Th>
                    <Th>Last seen</Th>
                  </tr>
                </thead>
                <tbody>
                  {grouped.map((r) => (
                    <tr key={`${r.slug}-${r.version}-${r.kind}`}>
                      <Td>{r.slug}</Td>
                      <Td className="font-mono text-xs">{r.version}</Td>
                      <Td>
                        <Badge tone="accent">{r.kind}</Badge>
                      </Td>
                      <Td>{r.activeInstalls.toLocaleString()}</Td>
                      <Td className="font-mono text-xs">{new Date(r.latest).toISOString()}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </Card>
          <Card>
            <CardTitle>Recent pings · raw sample</CardTitle>
            <div className="mt-4">
              <Table>
                <thead>
                  <tr>
                    <Th>When</Th>
                    <Th>Product</Th>
                    <Th>Version</Th>
                    <Th>WP</Th>
                    <Th>PHP</Th>
                    <Th>Host (hash)</Th>
                  </tr>
                </thead>
                <tbody>
                  {sample.map((p) => (
                    <tr key={p.id}>
                      <Td className="font-mono text-xs">{new Date(p.pingedAt).toISOString()}</Td>
                      <Td>{p.slug}</Td>
                      <Td className="font-mono text-xs">{p.version}</Td>
                      <Td>{p.wpVersion ?? '—'}</Td>
                      <Td>{p.phpVersion ?? '—'}</Td>
                      <Td className="font-mono text-xs text-[var(--color-dim)]">
                        {p.hostHash.slice(0, 12)}…
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </Card>
        </>
      )}
    </>
  );
}
