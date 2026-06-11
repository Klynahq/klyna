// Klyna Back-in-Stock — alert delivery.
//
// One job: take a queued Alert row and actually send it. Email goes through
// Resend, SMS through Twilio. Both providers are optional — if the relevant
// env vars are missing we run in "log only" mode (the Alert still gets a SENT
// timestamp so the rest of the pipeline behaves identically in dev). Swap the
// fetch calls here if you prefer Postmark / SendGrid / MessageBird; the shape
// the rest of the app depends on is just `deliver()` returning DeliveryResult.

export type DeliveryResult =
  | { ok: true; provider: string }
  | { ok: false; error: string };

export interface AlertPayload {
  channel: 'EMAIL' | 'SMS';
  recipient: string;
  shop: string;
  productTitle: string;
  variantTitle?: string | null;
  productUrl: string;
}

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

function buildEmail(payload: AlertPayload): { subject: string; html: string; text: string } {
  const name = [payload.productTitle, payload.variantTitle].filter(Boolean).join(' — ');
  const subject = `${payload.productTitle} is back in stock`;
  const text =
    `Good news! ${name} is back in stock.\n\n` +
    `Grab it before it sells out again: ${payload.productUrl}\n\n` +
    `You're receiving this because you asked to be notified. — ${payload.shop}`;
  const html = `<!doctype html>
<html><body style="margin:0;background:#f4f4f5;font-family:Inter,system-ui,Arial,sans-serif;color:#0b0b0f">
  <div style="max-width:480px;margin:0 auto;padding:32px 20px">
    <div style="background:#fff;border-radius:12px;border:1px solid #e4e4e7;overflow:hidden">
      <div style="background:linear-gradient(135deg,#9277ff,#5b3df0);padding:24px;color:#fff">
        <div style="font-size:13px;letter-spacing:.04em;text-transform:uppercase;opacity:.85">Back in stock</div>
        <div style="font-size:22px;font-weight:700;margin-top:4px">${escapeHtml(name)}</div>
      </div>
      <div style="padding:24px">
        <p style="margin:0 0 20px;line-height:1.6;color:#3f3f46">
          The item you were waiting for is available again. Stock can move fast — tap below to grab it.
        </p>
        <a href="${escapeAttr(payload.productUrl)}"
           style="display:inline-block;background:#7c5cff;color:#fff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:8px">
          Shop now
        </a>
      </div>
    </div>
    <p style="font-size:12px;color:#a1a1aa;text-align:center;margin-top:16px">
      You asked ${escapeHtml(payload.shop)} to notify you when this restocked.
    </p>
  </div>
</body></html>`;
  return { subject, html, text };
}

function buildSms(payload: AlertPayload): string {
  const name = [payload.productTitle, payload.variantTitle].filter(Boolean).join(' ');
  return `${name} is back in stock! Shop now: ${payload.productUrl}`;
}

export async function deliver(payload: AlertPayload): Promise<DeliveryResult> {
  if (payload.channel === 'EMAIL') return deliverEmail(payload);
  return deliverSms(payload);
}

async function deliverEmail(payload: AlertPayload): Promise<DeliveryResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ALERT_FROM_EMAIL ?? 'alerts@klyna.dev';
  const fromName = process.env.ALERT_FROM_NAME ?? 'Klyna Back-in-Stock';
  const { subject, html, text } = buildEmail(payload);

  if (!apiKey) {
    console.log(`[notifier] (log only) email → ${payload.recipient}: ${subject}`);
    return { ok: true, provider: 'log' };
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${fromName} <${from}>`,
        to: [payload.recipient],
        subject,
        html,
        text,
      }),
    });
    if (!res.ok) {
      return { ok: false, error: `Resend HTTP ${res.status}: ${await res.text()}` };
    }
    return { ok: true, provider: 'resend' };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'email send failed' };
  }
}

async function deliverSms(payload: AlertPayload): Promise<DeliveryResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  const body = buildSms(payload);

  if (!sid || !token || !from) {
    console.log(`[notifier] (log only) sms → ${payload.recipient}: ${body}`);
    return { ok: true, provider: 'log' };
  }

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: payload.recipient, From: from, Body: body }),
      },
    );
    if (!res.ok) {
      return { ok: false, error: `Twilio HTTP ${res.status}: ${await res.text()}` };
    }
    return { ok: true, provider: 'twilio' };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'sms send failed' };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, '&#39;');
}
