import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/node';
import { prisma } from '~/lib/db.server';
import { createGithubIssue } from '~/lib/github.server';
import {
  jsonResponse,
  parseJson,
  requireIngestSecret,
  requireRateLimit,
} from '~/lib/api.server';

export const loader = ({ request: _request }: LoaderFunctionArgs) =>
  jsonResponse({ error: 'method not allowed' }, { status: 405 });

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'method not allowed' }, { status: 405 });
  }
  const limited = requireRateLimit(request, 'tickets:sync', 30);
  if (limited) return limited;
  const unauthorized = requireIngestSecret(request);
  if (unauthorized) return unauthorized;

  const body = await parseJson<{ email?: string; subject?: string; message?: string; slug?: string }>(
    request,
    16 * 1024,
  );
  if (body instanceof Response) return body;
  if (typeof body.email !== 'string' || !EMAIL_RE.test(body.email)) {
    return jsonResponse({ error: 'invalid email' }, { status: 400 });
  }
  if (typeof body.subject !== 'string' || body.subject.length < 1 || body.subject.length > 200) {
    return jsonResponse({ error: 'invalid subject' }, { status: 400 });
  }
  if (typeof body.message !== 'string' || body.message.length < 1 || body.message.length > 10000) {
    return jsonResponse({ error: 'invalid message' }, { status: 400 });
  }
  const ticket = await prisma.supportTicket.create({
    data: {
      email: body.email.toLowerCase(),
      subject: body.subject,
      message: body.message,
    },
  });
  const issue = await createGithubIssue({
    title: `[support] ${ticket.subject}`,
    body: `From: ${ticket.email}\n\n${ticket.message}`,
    labels: ['support', body.slug ?? 'platform'],
  });
  if (issue) {
    await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: { githubIssueUrl: issue.url },
    });
  }
  return jsonResponse({ ok: true, id: ticket.id, issue: issue?.url ?? null });
}
