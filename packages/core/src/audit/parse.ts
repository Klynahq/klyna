/**
 * Lightweight HTML parsing — designed to run in browser AND Node without DOM dependencies.
 *
 * We use regex-based extraction instead of pulling in a heavy parser. For an SEO
 * audit we only care about: tags in head, headings, link/anchor counts, images
 * alt attributes, JSON-LD blocks. Regex is fast, dependency-free, and adequate
 * for these targeted extractions. When the extension runs in-page it can also
 * pass a parallel `document`-based extraction; the public API takes raw HTML.
 */

export interface ParsedTag {
  name: string;
  attrs: Record<string, string>;
  text?: string;
}

const ATTR_RE = /([a-zA-Z_][\w:-]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g;

function parseAttrs(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  let m: RegExpExecArray | null;
  ATTR_RE.lastIndex = 0;
  while ((m = ATTR_RE.exec(raw))) {
    const value = m[3] ?? m[4] ?? m[5] ?? '';
    if (m[1]) out[m[1].toLowerCase()] = value;
  }
  return out;
}

/** All `<meta ...>` tags from the document. */
export function extractMetaTags(html: string): ParsedTag[] {
  const re = /<meta\b([^>]*)\/?>/gi;
  const out: ParsedTag[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const raw = m[1];
    if (raw === undefined) continue;
    out.push({ name: 'meta', attrs: parseAttrs(raw) });
  }
  return out;
}

/** All `<link rel="...">` tags. */
export function extractLinkTags(html: string): ParsedTag[] {
  const re = /<link\b([^>]*)\/?>/gi;
  const out: ParsedTag[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const raw = m[1];
    if (raw === undefined) continue;
    out.push({ name: 'link', attrs: parseAttrs(raw) });
  }
  return out;
}

/** Page `<title>` text. */
export function extractTitle(html: string): string | undefined {
  const m = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return m?.[1]?.trim();
}

/** `<html lang="...">` attribute. */
export function extractLang(html: string): string | undefined {
  const m = /<html\b[^>]*\blang\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(html);
  return m?.[2] ?? m?.[3] ?? m?.[4];
}

export interface HeadingInfo {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  text: string;
}

/** All `<h1>` through `<h6>` tags with text. */
export function extractHeadings(html: string): HeadingInfo[] {
  const re = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  const out: HeadingInfo[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const level = parseInt(m[1] ?? '0', 10) as 1 | 2 | 3 | 4 | 5 | 6;
    const text = stripTags(m[2] ?? '').replace(/\s+/g, ' ').trim();
    if (text) out.push({ level, text });
  }
  return out;
}

export interface LinkInfo {
  href: string;
  text: string;
  rel?: string;
  internal: boolean;
}

/** All `<a href>` anchors classified internal vs external relative to `baseUrl`. */
export function extractAnchors(html: string, baseUrl: string): LinkInfo[] {
  const baseHost = safeHost(baseUrl);
  const re = /<a\b([^>]*?)>([\s\S]*?)<\/a>/gi;
  const out: LinkInfo[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const attrs = parseAttrs(m[1] ?? '');
    const href = attrs.href;
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) continue;
    const internal = isInternal(href, baseHost);
    out.push({
      href,
      text: stripTags(m[2] ?? '').replace(/\s+/g, ' ').trim(),
      rel: attrs.rel,
      internal,
    });
  }
  return out;
}

export interface ImageInfo {
  src: string;
  alt?: string;
  loading?: string;
  width?: string;
  height?: string;
}

/** All `<img>` tags with alt, loading, and dimensions. */
export function extractImages(html: string): ImageInfo[] {
  const re = /<img\b([^>]*)\/?>/gi;
  const out: ImageInfo[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const attrs = parseAttrs(m[1] ?? '');
    if (!attrs.src) continue;
    out.push({
      src: attrs.src,
      alt: attrs.alt,
      loading: attrs.loading,
      width: attrs.width,
      height: attrs.height,
    });
  }
  return out;
}

export interface SchemaBlock {
  type: string | string[];
  raw: unknown;
}

/** All `<script type="application/ld+json">` blocks, parsed. */
export function extractSchemaBlocks(html: string): SchemaBlock[] {
  const re = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const out: SchemaBlock[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const text = (m[1] ?? '').trim();
    if (!text) continue;
    try {
      const parsed = JSON.parse(text);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        const graph = (item as { '@graph'?: unknown[] })['@graph'];
        if (Array.isArray(graph)) {
          for (const node of graph) {
            const type = (node as { '@type'?: string | string[] })['@type'] ?? 'Unknown';
            out.push({ type, raw: node });
          }
        } else {
          const type = (item as { '@type'?: string | string[] })['@type'] ?? 'Unknown';
          out.push({ type, raw: item });
        }
      }
    } catch {
      // ignore malformed blocks; we surface them as a finding elsewhere
    }
  }
  return out;
}

/** Extract main text content from `<body>`. Best-effort, used for word counts. */
export function extractBodyText(html: string): string {
  const body = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(html)?.[1] ?? html;
  // Strip scripts, styles, and tags
  const noScript = body.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  const noStyle = noScript.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  return stripTags(noStyle).replace(/\s+/g, ' ').trim();
}

export function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, '');
}

export function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

function isInternal(href: string, baseHost: string): boolean {
  if (href.startsWith('/') && !href.startsWith('//')) return true;
  if (href.startsWith('./') || href.startsWith('../')) return true;
  try {
    const h = new URL(href, `https://${baseHost}`);
    return h.host === baseHost;
  } catch {
    return false;
  }
}
