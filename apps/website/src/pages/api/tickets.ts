import type { APIRoute } from 'astro';

export const prerender = false;

const ALLOWED_SUBJECTS = new Set([
  'Bug report',
  'Feature request',
  'Security issue',
  'Billing',
  'Other',
]);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Rate limit: 5 requests per IP per hour. In-memory only — this resets when
// the function cold-starts, which is fine for an indie support form.
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
const WINDOW_MS = 60 * 60 * 1000;
const LIMIT = 5;

function getIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]?.trim() || 'unknown';
  return (
    request.headers.get('x-real-ip') ||
    request.headers.get('cf-connecting-ip') ||
    'unknown'
  );
}

function checkRate(ip: string): { ok: boolean; retryAfter?: number } {
  const now = Date.now();
  const b = buckets.get(ip);
  if (!b || b.resetAt < now) {
    buckets.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true };
  }
  if (b.count >= LIMIT) {
    return { ok: false, retryAfter: Math.ceil((b.resetAt - now) / 1000) };
  }
  b.count += 1;
  return { ok: true };
}

function json(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extra },
  });
}

function ticketId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `klyna-${ts}-${rand}`;
}

async function createGithubIssue(
  token: string,
  subject: string,
  message: string,
  email: string
): Promise<string | null> {
  const repo = process.env.KLYNA_SUPPORT_REPO ?? 'klynahq/klyna-support';
  const preview = message.slice(0, 50).replace(/\s+/g, ' ');
  const title = `[${subject}] ${preview}${message.length > 50 ? '…' : ''}`;
  const body = [
    `**Subject:** ${subject}`,
    `**From:** ${email}`,
    '',
    '---',
    '',
    message,
  ].join('\n');

  const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'klyna-support-form',
    },
    body: JSON.stringify({
      title,
      body,
      labels: [subject.toLowerCase().replace(/\s+/g, '-')],
    }),
  });
  if (!res.ok) {
    console.warn('[tickets] github issue create failed', res.status, await res.text());
    return null;
  }
  const data = (await res.json()) as { number?: number; html_url?: string };
  return data.html_url ?? (data.number ? `gh-${data.number}` : null);
}

export const POST: APIRoute = async ({ request }) => {
  const ip = getIp(request);
  const rate = checkRate(ip);
  if (!rate.ok) {
    return json(
      429,
      { error: 'Rate limit exceeded. Try again later.' },
      { 'Retry-After': String(rate.retryAfter ?? 3600) }
    );
  }

  let payload: { email?: string; subject?: string; message?: string };
  try {
    payload = await request.json();
  } catch {
    return json(400, { error: 'Invalid JSON.' });
  }

  const email = String(payload.email ?? '').trim();
  const subject = String(payload.subject ?? '').trim();
  const message = String(payload.message ?? '').trim();

  if (!EMAIL_RE.test(email)) {
    return json(400, { error: 'Invalid email address.' });
  }
  if (!ALLOWED_SUBJECTS.has(subject)) {
    return json(400, { error: 'Invalid subject.' });
  }
  if (message.length < 20 || message.length > 2000) {
    return json(400, { error: 'Message must be 20 to 2000 characters.' });
  }

  const id = ticketId();
  const token = process.env.GITHUB_TOKEN;

  if (token) {
    const url = await createGithubIssue(token, subject, message, email);
    if (url) {
      return json(200, { ok: true, ticketId: id, url });
    }
    // Fall through — still return ok so the user sees a friendly screen.
  } else {
    console.info('[tickets] dev mode — no GITHUB_TOKEN set', {
      id,
      email,
      subject,
      messageLength: message.length,
    });
  }

  return json(200, { ok: true, ticketId: id });
};

export const GET: APIRoute = () =>
  json(405, { error: 'Method not allowed. Use POST.' });
