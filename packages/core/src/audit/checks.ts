/**
 * The audit checks. Each check is a pure function that takes the parsed
 * page context and returns zero or more findings. Adding a new check =
 * writing a new function and exporting it from this file.
 */

import { type Finding, type PageContext } from './types.ts';
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

function metaValue(html: string, key: string, kind: 'name' | 'property'): string | undefined {
  const tags = extractMetaTags(html);
  for (const tag of tags) {
    if (tag.attrs[kind]?.toLowerCase() === key.toLowerCase()) return tag.attrs.content;
  }
  return undefined;
}

export function checkTitle(ctx: PageContext): Finding[] {
  const out: Finding[] = [];
  const title = extractTitle(ctx.html) ?? ctx.title;
  if (!title) {
    out.push({
      id: 'meta.title.missing',
      category: 'meta',
      severity: 'error',
      message: 'Page is missing a <title> tag.',
      fix: 'Add a concise, descriptive <title> tag inside <head>. Aim for 50-60 characters.',
    });
    return out;
  }
  const len = title.length;
  if (len < 25) {
    out.push({
      id: 'meta.title.short',
      category: 'meta',
      severity: 'warn',
      message: `Title is short (${len} chars). Aim for 50-60 characters.`,
      evidence: title,
    });
  } else if (len > 65) {
    out.push({
      id: 'meta.title.long',
      category: 'meta',
      severity: 'warn',
      message: `Title is long (${len} chars). Google may truncate beyond ~60.`,
      evidence: title,
    });
  }
  return out;
}

export function checkDescription(ctx: PageContext): Finding[] {
  const desc = metaValue(ctx.html, 'description', 'name');
  if (!desc) {
    return [
      {
        id: 'meta.description.missing',
        category: 'meta',
        severity: 'warn',
        message: 'Page is missing a meta description.',
        fix: 'Add <meta name="description" content="..."> with 120-160 characters describing the page.',
      },
    ];
  }
  const len = desc.length;
  if (len < 70) {
    return [
      {
        id: 'meta.description.short',
        category: 'meta',
        severity: 'info',
        message: `Description is short (${len} chars). Aim for 120-160.`,
        evidence: desc,
      },
    ];
  }
  if (len > 170) {
    return [
      {
        id: 'meta.description.long',
        category: 'meta',
        severity: 'info',
        message: `Description is long (${len} chars). Google typically truncates beyond ~160.`,
        evidence: desc,
      },
    ];
  }
  return [];
}

export function checkCanonical(ctx: PageContext): Finding[] {
  const links = extractLinkTags(ctx.html);
  const canonical = links.find((l) => l.attrs.rel === 'canonical')?.attrs.href;
  if (!canonical) {
    return [
      {
        id: 'meta.canonical.missing',
        category: 'meta',
        severity: 'warn',
        message: 'No canonical URL declared.',
        fix: 'Add <link rel="canonical" href="..."> in <head> pointing to the preferred URL.',
      },
    ];
  }
  return [];
}

export function checkRobots(ctx: PageContext): Finding[] {
  const robots = metaValue(ctx.html, 'robots', 'name');
  if (robots && /noindex/i.test(robots)) {
    return [
      {
        id: 'meta.robots.noindex',
        category: 'meta',
        severity: 'error',
        message: 'Page is set to noindex — search engines will not include it.',
        evidence: robots,
        fix: 'Remove `noindex` from the meta robots tag if you want the page indexed.',
      },
    ];
  }
  return [];
}

export function checkLang(ctx: PageContext): Finding[] {
  const lang = extractLang(ctx.html);
  if (!lang) {
    return [
      {
        id: 'meta.lang.missing',
        category: 'meta',
        severity: 'info',
        message: 'No <html lang> attribute set.',
        fix: 'Add lang="en" (or your locale) to the <html> tag for accessibility + SEO.',
      },
    ];
  }
  return [];
}

export function checkHeadings(ctx: PageContext): Finding[] {
  const out: Finding[] = [];
  const headings = extractHeadings(ctx.html);
  const h1s = headings.filter((h) => h.level === 1);
  if (h1s.length === 0) {
    out.push({
      id: 'headings.h1.missing',
      category: 'headings',
      severity: 'error',
      message: 'Page has no <h1>.',
      fix: 'Add exactly one <h1> describing the page topic.',
    });
  } else if (h1s.length > 1) {
    out.push({
      id: 'headings.h1.multiple',
      category: 'headings',
      severity: 'warn',
      message: `Page has ${h1s.length} <h1> tags. Use exactly one.`,
    });
  }
  // Detect skipped levels (e.g. h1 -> h3 with no h2)
  let prev = 0;
  for (const h of headings) {
    if (prev && h.level > prev + 1) {
      out.push({
        id: 'headings.skipped',
        category: 'headings',
        severity: 'info',
        message: `Heading hierarchy skips from <h${prev}> to <h${h.level}>.`,
        evidence: h.text,
      });
      break;
    }
    prev = h.level;
  }
  return out;
}

export function checkImages(ctx: PageContext): Finding[] {
  const imgs = extractImages(ctx.html);
  const missing = imgs.filter((img) => !img.alt || img.alt.trim() === '');
  if (missing.length > 0) {
    return [
      {
        id: 'images.alt.missing',
        category: 'images',
        severity: 'warn',
        message: `${missing.length} of ${imgs.length} images are missing alt text.`,
        fix: 'Add descriptive alt attributes. Decorative images may use alt="".',
        weight: Math.min(15, 3 + missing.length),
      },
    ];
  }
  return [];
}

export function checkLinks(ctx: PageContext): Finding[] {
  const out: Finding[] = [];
  const anchors = extractAnchors(ctx.html, ctx.url);
  const internal = anchors.filter((a) => a.internal);
  if (internal.length < 3) {
    out.push({
      id: 'links.internal.few',
      category: 'links',
      severity: 'warn',
      message: `Only ${internal.length} internal links found. Internal linking is the highest-ROI SEO lever.`,
      fix: 'Link to 3-10 related internal pages from every important page.',
    });
  }
  const genericText = /^(click here|read more|learn more|here|this|link)$/i;
  const generic = anchors.filter((a) => genericText.test(a.text.trim()));
  if (generic.length > 0) {
    out.push({
      id: 'links.anchor.generic',
      category: 'links',
      severity: 'info',
      message: `${generic.length} links use generic anchor text ("click here", "read more"...).`,
      fix: 'Use descriptive anchor text that names the destination topic.',
    });
  }
  return out;
}

export function checkOpenGraph(ctx: PageContext): Finding[] {
  const out: Finding[] = [];
  const required = ['og:title', 'og:description', 'og:url', 'og:image'];
  for (const key of required) {
    if (!metaValue(ctx.html, key, 'property')) {
      out.push({
        id: `social.og.missing.${key.replace(':', '_')}`,
        category: 'social',
        severity: 'info',
        message: `Missing Open Graph meta: ${key}.`,
        fix: `Add <meta property="${key}" content="..."> for richer social previews.`,
      });
    }
  }
  return out;
}

export function checkTwitterCard(ctx: PageContext): Finding[] {
  const card = metaValue(ctx.html, 'twitter:card', 'name');
  if (!card) {
    return [
      {
        id: 'social.twitter.missing',
        category: 'social',
        severity: 'info',
        message: 'No twitter:card meta — social shares on X/Twitter may render small.',
        fix: 'Add <meta name="twitter:card" content="summary_large_image">.',
      },
    ];
  }
  return [];
}

export function checkSchema(ctx: PageContext): Finding[] {
  const out: Finding[] = [];
  const blocks = extractSchemaBlocks(ctx.html);
  if (blocks.length === 0) {
    out.push({
      id: 'schema.missing',
      category: 'schema',
      severity: 'warn',
      message: 'No JSON-LD structured data found.',
      fix: 'Add schema.org Article, Product, FAQ, BreadcrumbList — whichever fits the page.',
    });
    return out;
  }
  // Raw script blocks present but parse failure handled inside extractSchemaBlocks.
  // GEO bonus: explicitly recommend additions if generic types only.
  const types = blocks.flatMap((b) =>
    Array.isArray(b.type) ? b.type.map(String) : [String(b.type)],
  );
  const hasArticleish = types.some((t) =>
    ['Article', 'BlogPosting', 'NewsArticle', 'TechArticle'].includes(t),
  );
  const hasOrg = types.some((t) => ['Organization', 'WebSite'].includes(t));
  if (!hasOrg) {
    out.push({
      id: 'schema.organization.missing',
      category: 'schema',
      severity: 'info',
      message: 'Page has structured data but no Organization or WebSite schema.',
      fix: 'Add Organization + WebSite schema sitewide (helps brand SEO and GEO citations).',
    });
  }
  const looksArticle =
    /<article\b/i.test(ctx.html) || extractHeadings(ctx.html).some((h) => h.level === 1);
  if (looksArticle && !hasArticleish) {
    out.push({
      id: 'schema.article.missing',
      category: 'schema',
      severity: 'info',
      message: 'Looks like an article page but no Article / BlogPosting schema present.',
      fix: 'Add BlogPosting schema with author, datePublished, headline, and description.',
    });
  }
  return out;
}

export function checkContent(ctx: PageContext): Finding[] {
  const text = extractBodyText(ctx.html);
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words < 200) {
    return [
      {
        id: 'content.thin',
        category: 'content',
        severity: 'warn',
        message: `Page has only ${words} words of body content — search engines may consider this thin.`,
        fix: 'Aim for 500+ words of genuinely useful content on important pages.',
      },
    ];
  }
  return [];
}

export function checkGeo(ctx: PageContext): Finding[] {
  const out: Finding[] = [];
  const headings = extractHeadings(ctx.html);
  const hasComparisonHeading = headings.some((h) => /\bvs\.?\b|\bversus\b/i.test(h.text));
  const hasListicleHeading = headings.some((h) =>
    /^(top|best|\d+ ways|\d+ tips|\d+ reasons)/i.test(h.text),
  );
  const hasFaqHeading = headings.some((h) => /\bfaq\b|frequently asked/i.test(h.text));
  const blocks = extractSchemaBlocks(ctx.html);
  const hasFaqSchema = blocks.some((b) =>
    Array.isArray(b.type) ? b.type.includes('FAQPage') : b.type === 'FAQPage',
  );
  if (!hasComparisonHeading && !hasListicleHeading && !hasFaqHeading) {
    out.push({
      id: 'geo.structure.weak',
      category: 'geo',
      severity: 'info',
      message: 'Page lacks comparison, listicle, or FAQ structure — formats LLMs cite most.',
      fix: 'Add a comparison table, numbered list, or FAQ block. LLMs cite structured content far more than long-form prose.',
    });
  }
  if (hasFaqHeading && !hasFaqSchema) {
    out.push({
      id: 'geo.faq.schema',
      category: 'geo',
      severity: 'warn',
      message: 'Page has a FAQ section but no FAQPage schema.',
      fix: 'Add schema.org FAQPage with each question/answer pair. Massive boost for GEO citation share.',
    });
  }
  return out;
}

export const allChecks = [
  checkTitle,
  checkDescription,
  checkCanonical,
  checkRobots,
  checkLang,
  checkHeadings,
  checkImages,
  checkLinks,
  checkOpenGraph,
  checkTwitterCard,
  checkSchema,
  checkContent,
  checkGeo,
] as const;
