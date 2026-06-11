import type { LoaderFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { PageHeader, Stat, Card, CardTitle, Badge } from '~/components/ui';
import { prisma } from '~/lib/db.server';
import { requireAdmin } from '~/lib/session.server';

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdmin(request);
  const now = Date.now();
  const d7 = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const d30 = new Date(now - 30 * 24 * 60 * 60 * 1000);

  const [downloads7d, downloads30d, downloadsAll, totalPings, activeInstalls, openTickets, dailySeries] =
    await Promise.all([
      prisma.downloadEvent.count({ where: { downloadedAt: { gte: d7 } } }),
      prisma.downloadEvent.count({ where: { downloadedAt: { gte: d30 } } }),
      prisma.downloadEvent.count(),
      prisma.installPing.count(),
      prisma.installPing.findMany({
        where: { pingedAt: { gte: d30 } },
        select: { hostHash: true },
        distinct: ['hostHash'],
      }),
      prisma.supportTicket.count({ where: { status: 'open' } }),
      prisma.downloadEvent.findMany({
        where: { downloadedAt: { gte: d30 } },
        select: { downloadedAt: true },
      }),
    ]);

  // Build a 30-day sparkline (counts per day).
  const buckets = new Array(30).fill(0);
  for (const d of dailySeries) {
    const idx = 29 - Math.floor((now - d.downloadedAt.getTime()) / (24 * 60 * 60 * 1000));
    if (idx >= 0 && idx < 30) buckets[idx]++;
  }

  return json({
    downloads7d,
    downloads30d,
    downloadsAll,
    totalPings,
    activeInstalls: activeInstalls.length,
    openTickets,
    buckets,
  });
}

function Sparkline({ data }: { data: number[] }) {
  const max = Math.max(1, ...data);
  const w = 280;
  const h = 60;
  const step = w / Math.max(1, data.length - 1);
  const points = data
    .map((v, i) => `${i * step},${h - (v / max) * (h - 4) - 2}`)
    .join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-16 w-full">
      <polyline
        fill="none"
        stroke="#7c5cff"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points}
      />
    </svg>
  );
}

export default function Dashboard() {
  const d = useLoaderData<typeof loader>();
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Klyna fleet at a glance."
        actions={<Badge tone="accent">Live</Badge>}
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Stat label="Downloads · 7d" value={d.downloads7d.toLocaleString()} />
        <Stat label="Downloads · 30d" value={d.downloads30d.toLocaleString()} />
        <Stat label="Downloads · all-time" value={d.downloadsAll.toLocaleString()} />
        <Stat
          label="Active installs"
          value={d.activeInstalls.toLocaleString()}
          hint={`${d.totalPings.toLocaleString()} total pings`}
        />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardTitle>Downloads · last 30 days</CardTitle>
          <div className="mt-3">
            <Sparkline data={d.buckets} />
          </div>
        </Card>
        <Stat
          label="Open tickets"
          value={d.openTickets}
          hint={d.openTickets === 0 ? 'Inbox zero — nice.' : 'Triage in /admin/tickets'}
        />
      </div>
    </>
  );
}
