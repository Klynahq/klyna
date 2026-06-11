import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/node';
import { json, redirect } from '@remix-run/node';
import { Form, useLoaderData } from '@remix-run/react';
import { Badge, Button, Card, CardTitle, EmptyState, Label, PageHeader, Select, Table, Td, Textarea, Th, TextInput } from '~/components/ui';
import { prisma } from '~/lib/db.server';
import { csrfFor, requireAdmin, verifyCsrf } from '~/lib/session.server';

const CATEGORIES = ['install', 'configure', 'troubleshoot', 'api', 'byok'] as const;

export async function loader({ request }: LoaderFunctionArgs) {
  const admin = await requireAdmin(request);
  const url = new URL(request.url);
  const editId = url.searchParams.get('id');
  const articles = await prisma.helpArticle.findMany({ orderBy: { updatedAt: 'desc' } });
  const editing = editId ? await prisma.helpArticle.findUnique({ where: { id: editId } }) : null;
  return json({ articles, editing, csrf: csrfFor(admin) });
}

export async function action({ request }: ActionFunctionArgs) {
  const admin = await requireAdmin(request);
  const form = await request.formData();
  if (!verifyCsrf(admin, String(form.get('csrf') ?? ''))) {
    throw new Response('CSRF check failed', { status: 403 });
  }
  const intent = String(form.get('intent') ?? '');
  if (intent === 'delete') {
    const id = String(form.get('id') ?? '');
    if (id) await prisma.helpArticle.delete({ where: { id } }).catch(() => {});
    return redirect('/admin/articles');
  }
  if (intent === 'save') {
    const id = String(form.get('id') ?? '');
    const slug = String(form.get('slug') ?? '').trim().toLowerCase();
    const title = String(form.get('title') ?? '').trim();
    const body = String(form.get('body') ?? '');
    const category = String(form.get('category') ?? 'install');
    const published = form.get('published') === 'on';
    if (!slug || !title || !CATEGORIES.includes(category as (typeof CATEGORIES)[number])) {
      throw new Response('Missing fields', { status: 400 });
    }
    if (id) {
      await prisma.helpArticle.update({
        where: { id },
        data: { slug, title, body, category, published },
      });
    } else {
      await prisma.helpArticle.create({
        data: { slug, title, body, category, published },
      });
    }
    return redirect('/admin/articles');
  }
  throw new Response('Unknown intent', { status: 400 });
}

export default function Articles() {
  const { articles, editing, csrf } = useLoaderData<typeof loader>();
  return (
    <>
      <PageHeader
        title="Help articles"
        description="Draft, edit, and publish knowledge-base entries."
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardTitle>{editing ? 'Edit article' : 'New article'}</CardTitle>
          <Form method="post" className="mt-3 space-y-3">
            <input type="hidden" name="csrf" value={csrf} />
            <input type="hidden" name="intent" value="save" />
            {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
            <div>
              <Label htmlFor="title">Title</Label>
              <TextInput id="title" name="title" required defaultValue={editing?.title ?? ''} />
            </div>
            <div>
              <Label htmlFor="slug">Slug</Label>
              <TextInput id="slug" name="slug" required defaultValue={editing?.slug ?? ''} pattern="[a-z0-9-]+" />
            </div>
            <div>
              <Label htmlFor="category">Category</Label>
              <Select id="category" name="category" defaultValue={editing?.category ?? 'install'}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="body">Body (Markdown)</Label>
              <Textarea id="body" name="body" rows={12} defaultValue={editing?.body ?? ''} />
            </div>
            <label className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
              <input type="checkbox" name="published" defaultChecked={editing?.published ?? false} />
              Published
            </label>
            <div className="flex gap-2">
              <Button type="submit">{editing ? 'Save changes' : 'Create article'}</Button>
              {editing ? (
                <a
                  href="/admin/articles"
                  className="inline-flex items-center justify-center rounded-[8px] border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-muted)] hover:text-[var(--color-text)]"
                >
                  Cancel
                </a>
              ) : null}
            </div>
          </Form>
        </Card>
        <Card>
          <CardTitle>Articles</CardTitle>
          {articles.length === 0 ? (
            <div className="mt-3">
              <EmptyState title="No articles yet" />
            </div>
          ) : (
            <div className="mt-3">
              <Table>
                <thead>
                  <tr>
                    <Th>Title</Th>
                    <Th>Category</Th>
                    <Th>Status</Th>
                    <Th>Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {articles.map((a) => (
                    <tr key={a.id}>
                      <Td>
                        <a href={`/admin/articles?id=${a.id}`} className="text-[var(--color-text)] hover:text-[var(--color-accent)]">
                          {a.title}
                        </a>
                        <div className="text-xs text-[var(--color-dim)]">/{a.slug}</div>
                      </Td>
                      <Td>{a.category}</Td>
                      <Td>
                        <Badge tone={a.published ? 'success' : 'neutral'}>
                          {a.published ? 'published' : 'draft'}
                        </Badge>
                      </Td>
                      <Td>
                        <Form method="post" className="inline">
                          <input type="hidden" name="csrf" value={csrf} />
                          <input type="hidden" name="intent" value="delete" />
                          <input type="hidden" name="id" value={a.id} />
                          <button
                            type="submit"
                            className="text-xs text-[var(--color-danger)] hover:underline"
                            onClick={(e) => {
                              if (!confirm('Delete this article?')) e.preventDefault();
                            }}
                          >
                            Delete
                          </button>
                        </Form>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
