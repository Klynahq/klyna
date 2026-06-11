import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/node';
import { json, redirect } from '@remix-run/node';
import { Form, useLoaderData } from '@remix-run/react';
import { Badge, Button, Card, CardTitle, EmptyState, Label, PageHeader, Select, Table, Td, Textarea, Th } from '~/components/ui';
import { prisma } from '~/lib/db.server';
import { sendEmail } from '~/lib/email.server';
import { csrfFor, requireAdmin, verifyCsrf } from '~/lib/session.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const admin = await requireAdmin(request);
  const url = new URL(request.url);
  const status = url.searchParams.get('status') ?? 'open';
  const selectedId = url.searchParams.get('id');
  const tickets = await prisma.supportTicket.findMany({
    where: status === 'all' ? {} : { status },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  const selected = selectedId
    ? await prisma.supportTicket.findUnique({
        where: { id: selectedId },
        include: { replies: { orderBy: { createdAt: 'asc' } } },
      })
    : null;
  return json({ tickets, selected, status, csrf: csrfFor(admin) });
}

export async function action({ request }: ActionFunctionArgs) {
  const admin = await requireAdmin(request);
  const form = await request.formData();
  if (!verifyCsrf(admin, String(form.get('csrf') ?? ''))) {
    throw new Response('CSRF check failed', { status: 403 });
  }
  const intent = String(form.get('intent') ?? '');
  const id = String(form.get('id') ?? '');
  if (!id) throw new Response('Missing ticket id', { status: 400 });
  const ticket = await prisma.supportTicket.findUnique({ where: { id } });
  if (!ticket) throw new Response('Not found', { status: 404 });

  if (intent === 'status') {
    const status = String(form.get('status') ?? 'open');
    if (!['open', 'in_progress', 'closed'].includes(status)) {
      throw new Response('Invalid status', { status: 400 });
    }
    await prisma.supportTicket.update({ where: { id }, data: { status } });
    return redirect(`/admin/tickets?id=${id}`);
  }
  if (intent === 'reply') {
    const body = String(form.get('body') ?? '').trim();
    if (!body) throw new Response('Empty reply', { status: 400 });
    await prisma.ticketReply.create({
      data: { ticketId: id, author: admin.email, body },
    });
    await prisma.supportTicket.update({
      where: { id },
      data: { status: 'in_progress' },
    });
    await sendEmail({
      to: ticket.email,
      subject: `Re: ${ticket.subject}`,
      text: `${body}\n\n— Klyna support`,
    });
    return redirect(`/admin/tickets?id=${id}`);
  }
  throw new Response('Unknown intent', { status: 400 });
}

export default function Tickets() {
  const { tickets, selected, status, csrf } = useLoaderData<typeof loader>();
  return (
    <>
      <PageHeader
        title="Support tickets"
        description="Inbox for support@klyna.dev. Replies are emailed via Resend."
        actions={
          <Form method="get" className="flex items-center gap-2">
            <Label htmlFor="status">Status</Label>
            <Select id="status" name="status" defaultValue={status} onChange={(e) => e.currentTarget.form?.submit()}>
              <option value="open">Open</option>
              <option value="in_progress">In progress</option>
              <option value="closed">Closed</option>
              <option value="all">All</option>
            </Select>
          </Form>
        }
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="md:col-span-1">
          <CardTitle>Queue</CardTitle>
          {tickets.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--color-muted)]">No tickets.</p>
          ) : (
            <ul className="mt-3 space-y-1">
              {tickets.map((t) => (
                <li key={t.id}>
                  <a
                    href={`/admin/tickets?id=${t.id}&status=${status}`}
                    className={`block rounded-md border px-3 py-2 text-sm ${
                      selected?.id === t.id
                        ? 'border-[rgba(124,92,255,0.35)] bg-[rgba(124,92,255,0.12)]'
                        : 'border-transparent hover:bg-[var(--color-bg-elevated)]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-[var(--color-text)]">{t.subject}</span>
                      <Badge
                        tone={
                          t.status === 'open' ? 'warning' : t.status === 'in_progress' ? 'accent' : 'success'
                        }
                      >
                        {t.status}
                      </Badge>
                    </div>
                    <div className="text-xs text-[var(--color-muted)]">{t.email}</div>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <div className="md:col-span-2">
          {!selected ? (
            <EmptyState title="Pick a ticket" description="Select something from the queue to view it." />
          ) : (
            <>
              <Card className="mb-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-[var(--color-text)]">{selected.subject}</h2>
                    <p className="text-xs text-[var(--color-muted)]">
                      From {selected.email} · {new Date(selected.createdAt).toISOString()}
                    </p>
                  </div>
                  <Form method="post" className="flex items-center gap-2">
                    <input type="hidden" name="csrf" value={csrf} />
                    <input type="hidden" name="intent" value="status" />
                    <input type="hidden" name="id" value={selected.id} />
                    <Select name="status" defaultValue={selected.status}>
                      <option value="open">Open</option>
                      <option value="in_progress">In progress</option>
                      <option value="closed">Closed</option>
                    </Select>
                    <Button type="submit" variant="ghost">Update</Button>
                  </Form>
                </div>
                <pre className="mt-4 whitespace-pre-wrap rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-3 text-sm font-sans text-[var(--color-text)]">
                  {selected.message}
                </pre>
                {selected.replies.map((r) => (
                  <div
                    key={r.id}
                    className="mt-3 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3"
                  >
                    <div className="mb-1 text-xs text-[var(--color-muted)]">
                      {r.author} · {new Date(r.createdAt).toISOString()}
                    </div>
                    <pre className="whitespace-pre-wrap font-sans text-sm">{r.body}</pre>
                  </div>
                ))}
              </Card>
              <Card>
                <CardTitle>Reply</CardTitle>
                <Form method="post" className="mt-3 space-y-3">
                  <input type="hidden" name="csrf" value={csrf} />
                  <input type="hidden" name="intent" value="reply" />
                  <input type="hidden" name="id" value={selected.id} />
                  <Textarea name="body" rows={6} required placeholder="Type your reply…" />
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-[var(--color-dim)]">
                      Sends via Resend if configured, otherwise logged to server console.
                    </p>
                    <Button type="submit">Send reply</Button>
                  </div>
                </Form>
              </Card>
            </>
          )}
        </div>
      </div>
    </>
  );
}
