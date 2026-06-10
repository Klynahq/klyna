import {
  type AuditResult,
  type Finding,
  type PageContext,
  defaultWeight,
} from './types.ts';
import {
  extractAnchors,
  extractBodyText,
  extractHeadings,
  extractImages,
  extractLang,
  extractLinkTags,
  extractMetaTags,
  extractSchemaBlocks,
  extractTitle,
} from './parse.ts';
import { allChecks } from './checks.ts';

export * from './types.ts';
export * from './parse.ts';

function metaValue(html: string, key: string, kind: 'name' | 'property'): string | undefined {
  for (const tag of extractMetaTags(html)) {
    if (tag.attrs[kind]?.toLowerCase() === key.toLowerCase()) return tag.attrs.content;
  }
  return undefined;
}

function gradeFor(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

/**
 * Audit a page. Runs every check, aggregates findings, computes a score.
 *
 * Pure function — same input always produces the same output. Safe to call
 * in any JS environment: Node, browser, Cloudflare Worker, PHP-WASM sidecar.
 */
export function auditPage(ctx: PageContext): AuditResult {
  const findings: Finding[] = [];
  for (const check of allChecks) {
    try {
      findings.push(...check(ctx));
    } catch {
      // Defensive — a check throwing should not break the whole audit.
    }
  }

  // Score: start at 100, subtract weighted findings, floor at 0.
  let score = 100;
  for (const f of findings) {
    const w = f.weight ?? defaultWeight(f.severity);
    score -= w;
  }
  score = Math.max(0, Math.min(100, Math.round(score)));

  const headings = extractHeadings(ctx.html);
  const anchors = extractAnchors(ctx.html, ctx.url);
  const images = extractImages(ctx.html);
  const schema = extractSchemaBlocks(ctx.html);
  const text = extractBodyText(ctx.html);
  const wordCount = text.split(/\s+/).filter(Boolean).length;

  return {
    url: ctx.url,
    score,
    grade: gradeFor(score),
    findings,
    stats: {
      headings: {
        h1: headings.filter((h) => h.level === 1).length,
        h2: headings.filter((h) => h.level === 2).length,
        h3: headings.filter((h) => h.level === 3).length,
      },
      links: {
        internal: anchors.filter((a) => a.internal).length,
        external: anchors.filter((a) => !a.internal).length,
        total: anchors.length,
      },
      images: {
        total: images.length,
        missingAlt: images.filter((i) => !i.alt || i.alt.trim() === '').length,
      },
      schema: {
        count: schema.length,
        types: Array.from(
          new Set(
            schema.flatMap((b) =>
              Array.isArray(b.type) ? b.type.map(String) : [String(b.type)],
            ),
          ),
        ),
      },
      word_count: wordCount,
      reading_time_minutes: Math.max(1, Math.round(wordCount / 225)),
    },
    meta: {
      title: extractTitle(ctx.html) ?? ctx.title,
      description: metaValue(ctx.html, 'description', 'name'),
      canonical: extractLinkTags(ctx.html).find((l) => l.attrs.rel === 'canonical')?.attrs.href,
      ogTitle: metaValue(ctx.html, 'og:title', 'property'),
      ogDescription: metaValue(ctx.html, 'og:description', 'property'),
      ogImage: metaValue(ctx.html, 'og:image', 'property'),
      twitterCard: metaValue(ctx.html, 'twitter:card', 'name'),
      lang: extractLang(ctx.html),
      robots: metaValue(ctx.html, 'robots', 'name'),
    },
  };
}
