function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (!v) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`Missing required env var: ${name}`);
    }
    return fallback ?? '';
  }
  return v;
}

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  SESSION_SECRET: required('SESSION_SECRET', 'dev-secret-change-me-please-rotate-now'),
  ADMIN_EMAILS: (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
  RESEND_API_KEY: process.env.RESEND_API_KEY ?? '',
  RESEND_FROM: process.env.RESEND_FROM ?? 'Klyna Admin <admin@klyna.dev>',
  // Accept either name — TRACK_SHARED_SECRET is the canonical one used in
  // SECRETS.md / GO_LIVE.md; KLYNA_INGEST_SECRET is the legacy name kept for
  // backwards compatibility with the first admin scaffold.
  KLYNA_INGEST_SECRET:
    process.env.TRACK_SHARED_SECRET ?? process.env.KLYNA_INGEST_SECRET ?? '',
  GITHUB_TOKEN: process.env.GITHUB_TOKEN ?? '',
  GITHUB_REPO: process.env.GITHUB_REPO ?? '',
  APP_URL: process.env.APP_URL ?? 'http://localhost:3100',
};

export function isAdminEmail(email: string): boolean {
  return env.ADMIN_EMAILS.includes(email.trim().toLowerCase());
}
