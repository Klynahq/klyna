import type { LoaderFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { Form, Link, useLoaderData, useSearchParams } from '@remix-run/react';
import { Badge, Card, EmptyState, Label, PageHeader, Select, Table, Td, Th, TextInput } from '~/components/ui';
import { prisma } from '~/lib/db.server';
import { requireAdmin } from '~/lib/session.server';

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdmin(request);
  const url = new URL(request.url);
  const slug = url.searchParams.get('slug') ?? '';
  const kind = url.searchParams.get('kind') ?? '';
  const from = url.searchParams.get('from') ?? '';
  const to = url.searchParams.get('to') ?? '';
  const format = url.searchParams.get('format') ?? '';

  const where: Record<string, unknown> = {};
  if (slug) where.slug = slug;
  if (kind) where.kind = kind;
  const range: Record<string, Date> = {};
  if (from) {
    const d = new Date(from);
    if (!Number.isNaN(d.getTime())) range.gte = d;
  }
  if (to) {
    const d = new Date(to);
    if (!Number.isNaN(d.getTime())) range.lte = d;
  }
  if (Object.keys(range).length) where.downloadedAt = range;

  const rows = await prisma.downloadEvent.findMany({
    where,
    orderBy: { downloadedAt: 'desc' },
    take: format === 'csv' ? 10000 : 500,
  });

  if (format === 'csv') {
    const header = 'id,slug,kind,downloadedAt,country\n';
    const body = rows
      .map(
        (r) =>
          `${r.id},${r.slug},${r.kind},${r.downloadedAt.toISOString()},${r.country ?? ''}`,
      )
      .join('\n');
    return new Response(header + body, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="klyna-downloads-${Date.now()}.csv"`,
      },
    });
  }

  const slugs = await prisma.downloadEvent.findMany({
    distinct: ['slug'],
    select: { slug: true },
    orderBy: { slug: 'asc' },
  });

  return json({ rows, slugs: slugs.map((s) => s.slug), filters: { slug, kind, from, to } });
}

export default function Downloads() {
  const { rows, slugs, filters } = useLoaderData<typeof loader>();
  const [params] = useSearchParams();
  const csvHref = `/admin/downloads?${new URLSearchParams({ ...Object.fromEntries(params), format: 'csv' }).toString()}`;

  return (
    <>
      <PageHeader
        title="Downloads"
        description="Every plugin, app, and theme download we've recorded."
        actions={
          <Link
            to={csvHref}
            reloadDocument
            className="rounded-[8px] border border-[var(--color-border)] bg-transparent px-4 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-bg-elevated)]"
          >
            Export CSV
          </Link>
        }
      />
      <Card className="mb-4">
        <Form method="get" className="grid grid-cols-1 gap-3 md:grid-cols-5">
          <div>
            <Label htmlFor="slug">Product</Label>
            <Select id="slug" name="slug" defaultValue={filters.slug}>
              <option value="">All</option>
              {slugs.map((s: string) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="kind">Kind</Label>
            <Select id="kind" name="kind" defaultValue={filters.kind}>
              <option value="">All</option>
              <option value="wp">WordPress</option>
              <option value="shopify">Shopify</option>
              <option value="theme">Theme</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="from">From</Label>
            <TextInput id="from" type="date" name="from" defaultValue={filters.from} />
          </div>
          <div>
            <Label htmlFor="to">To</Label>
            <TextInput id="to" type="date" name="to" defaultValue={filters.to} />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              className="rounded-[8px] bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)]"
            >
              Apply
            </button>
          </div>
        </Form>
      </Card>
      {rows.length === 0 ? (
        <EmptyState title="No downloads yet" description="Plugin and app installers will POST here." />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>When</Th>
              <Th>Product</Th>
              <Th>Kind</Th>
              <Th>Country</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r: { id: string; slug: string; kind: string; downloadedAt: string; country: string | null }) => (
              <tr key={r.id}>
                <Td className="font-mono text-xs">{new Date(r.downloadedAt).toISOString()}</Td>
                <Td>{r.slug}</Td>
                <Td>
                  <Badge tone="accent">{r.kind}</Badge>
                </Td>
                <Td>{r.country ?? '—'}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
