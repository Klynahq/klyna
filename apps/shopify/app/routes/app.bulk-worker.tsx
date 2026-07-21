import { auditPage } from '@klyna/core';
import { type ActionFunctionArgs, json } from '@remix-run/node';
import prisma from '../db.server';
import { authenticate } from '../shopify.server';

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();
  const urls = form.getAll('url').map(String).filter(Boolean);
  const totalUrls = Math.max(
    urls.length,
    Number(form.get('totalUrls') ?? urls.length) || urls.length,
  );
  const completedBefore = Math.max(0, Number(form.get('completedBefore') ?? 0) || 0);

  if (urls.length === 0) {
    return json({ results: [] });
  }

  let scan = await prisma.bulkScan.findFirst({
    where: { shop, status: 'running' },
    orderBy: { startedAt: 'desc' },
  });

  if (completedBefore === 0) {
    await prisma.bulkScan.updateMany({
      where: { shop, status: 'running' },
      data: { status: 'failed', finishedAt: new Date() },
    });
    scan = await prisma.bulkScan.create({
      data: { shop, status: 'running', totalUrls, scannedUrls: 0 },
    });
  } else if (!scan) {
    scan = await prisma.bulkScan.create({
      data: { shop, status: 'running', totalUrls, scannedUrls: completedBefore },
    });
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
          errors: 1,
          warnings: 0,
          ok: false as const,
          error: err instanceof Error ? err.message : 'Fetch failed',
        };
      }
    }),
  );

  const rows = results.map((r) =>
    r.status === 'fulfilled'
      ? r.value
      : {
          url: '',
          ok: false as const,
          score: 0,
          grade: 'F',
          errors: 1,
          warnings: 0,
          error: 'Internal error',
        },
  );
  const scannedUrls = Math.min(totalUrls, completedBefore + urls.length);
  const successfulScores = rows.filter((r) => r.ok).map((r) => r.score);
  const avgScore =
    successfulScores.length > 0
      ? successfulScores.reduce((sum, score) => sum + score, 0) / successfulScores.length
      : null;

  await prisma.bulkScan.update({
    where: { id: scan.id },
    data: {
      scannedUrls,
      totalUrls,
      ...(avgScore !== null ? { avgScore } : {}),
      ...(scannedUrls >= totalUrls ? { status: 'done', finishedAt: new Date() } : {}),
    },
  });

  return json({
    results: rows,
  });
};
