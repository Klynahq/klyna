import { env } from './env.server';

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export async function sendEmail(msg: EmailMessage): Promise<{ delivered: boolean; reason?: string }> {
  if (!env.RESEND_API_KEY) {
    console.log(`[email] (not sent — RESEND_API_KEY unset) to=${msg.to} subject="${msg.subject}"`);
    console.log(msg.text);
    return { delivered: false, reason: 'RESEND_API_KEY not set' };
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.RESEND_FROM,
        to: msg.to,
        subject: msg.subject,
        text: msg.text,
        html: msg.html,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[email] resend error', res.status, body);
      return { delivered: false, reason: `resend ${res.status}` };
    }
    return { delivered: true };
  } catch (err) {
    console.error('[email] fetch error', err);
    return { delivered: false, reason: String(err) };
  }
}
