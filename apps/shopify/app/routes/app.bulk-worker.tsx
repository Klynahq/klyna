import { auditPage } from '@klyna/core';
import { type ActionFunctionArgs, json } from '@remix-run/node';
import prisma from '../db.server';
import { authenticate } from '../shopify.server';

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();
  const urls = form.getAll('url').map(String).filter(Boolean);

  if (urls.length === 0) {
    return json({ results: [] });
  }

  const results = await Promise.allSettled(
    urls.map(async (url) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      try {
        const res = await fetch(url, {
          signal: controller.signal,
          headers: { 'User-Agent': 'KlynaBot/0.1 (+https://klyna.dev)' },
        });
        clearTimeout(timer);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const html = await res.text();
        const result = auditPage({ url, html, fetchedAt: new Date().toISOString() });

        // Upsert so re-scans overwrite rather than accumulate
        await prisma.auditResult.create({
          data: {
            shop,
            url,
            score: result.score,
            grade: result.grade,
            findings: JSON.stringify(result.findings),
          },
        });

        return {
          url,
          score: result.score,
          grade: result.grade,
          errors: result.findings.filter((f) => f.severity === 'error').length,
          warnings: result.findings.filter((f) => f.severity === 'warn').length,
          ok: true as const,
        };
      } catch (err) {
        clearTimeout(timer);
        return {
          url,
          score: 0,
          grade: 'F',
          errors: 0,
          warnings: 0,
          ok: false as const,
          error: err instanceof Error ? err.message : 'Fetch failed',
        };
      }
    }),
  );

  return json({
    results: results.map((r) =>
      r.status === 'fulfilled' ? r.value : { url: '', ok: false, error: 'Internal error' },
    ),
  });
};
