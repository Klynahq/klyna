/**
 * Internal-linking suggestion engine.
 *
 * Given a set of pages (url + text content), suggest internal links that
 * are missing but would be relevant. Uses local TF-IDF + cosine similarity —
 * zero API calls, zero cost, runs in any JS environment.
 *
 * The algorithm:
 *  1. Tokenize each page's text into terms.
 *  2. Compute TF-IDF vectors over the corpus.
 *  3. For every (source, target) pair where target is NOT already linked from source:
 *       - Compute cosine similarity of their vectors.
 *       - Score the suggestion by similarity * target.importance.
 *  4. Return the top-N suggestions per source page.
 */

export interface LinkingPage {
  url: string;
  title: string;
  /** Plain-text body (markdown, HTML stripped, etc.). */
  text: string;
  /** URLs already linked from this page. */
  outLinks: string[];
  /** Optional importance hint (e.g. pageviews). Defaults to 1. */
  importance?: number;
}

export interface LinkSuggestion {
  fromUrl: string;
  toUrl: string;
  /** Title of the target page (for anchor text suggestions). */
  toTitle: string;
  /** 0..1 cosine similarity. */
  similarity: number;
  /** Suggested anchor — the most-co-occurring term between the two pages. */
  suggestedAnchor: string;
  /** Excerpt from `from` where the anchor naturally fits. */
  excerpt?: string;
}

const STOP_WORDS = new Set<string>([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'have',
  'he', 'her', 'his', 'i', 'if', 'in', 'is', 'it', 'its', 'of', 'on', 'or', 'our',
  'she', 'so', 'the', 'their', 'them', 'they', 'this', 'to', 'was', 'we', 'were',
  'will', 'with', 'you', 'your', 'about', 'into', 'than', 'that', 'these', 'those',
  'just', 'not', 'do', 'does', 'did', 'but', 'all', 'any', 'can', 'us', 'me', 'my',
  'no', 'one', 'two', 'three', 'when', 'where', 'how', 'why', 'what', 'who',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOP_WORDS.has(t));
}

function tf(tokens: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1);
  return counts;
}

function idf(corpus: Map<string, number>[]): Map<string, number> {
  const N = corpus.length;
  const df = new Map<string, number>();
  for (const doc of corpus) {
    for (const term of doc.keys()) df.set(term, (df.get(term) ?? 0) + 1);
  }
  const idfMap = new Map<string, number>();
  for (const [term, count] of df) {
    idfMap.set(term, Math.log(N / count) + 1);
  }
  return idfMap;
}

function tfidf(tfMap: Map<string, number>, idfMap: Map<string, number>): Map<string, number> {
  const out = new Map<string, number>();
  for (const [term, freq] of tfMap) {
    out.set(term, freq * (idfMap.get(term) ?? 0));
  }
  return out;
}

function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  let aMag = 0;
  let bMag = 0;
  for (const [, v] of a) aMag += v * v;
  for (const [, v] of b) bMag += v * v;
  // Iterate over the smaller map for performance
  const [small, large] = a.size < b.size ? [a, b] : [b, a];
  for (const [term, v] of small) {
    const other = large.get(term);
    if (other !== undefined) dot += v * other;
  }
  if (aMag === 0 || bMag === 0) return 0;
  return dot / (Math.sqrt(aMag) * Math.sqrt(bMag));
}

function suggestAnchor(
  fromVec: Map<string, number>,
  toVec: Map<string, number>,
  toTitle: string,
): string {
  // Anchor = highest-weighted term shared between the two pages,
  // falling back to the target title.
  let bestTerm = '';
  let bestScore = 0;
  for (const [term, weight] of toVec) {
    const fromWeight = fromVec.get(term);
    if (!fromWeight) continue;
    const score = weight * fromWeight;
    if (score > bestScore) {
      bestScore = score;
      bestTerm = term;
    }
  }
  return bestTerm || toTitle;
}

export interface SuggestLinksOptions {
  /** Maximum suggestions returned per source page. Default 5. */
  perPage?: number;
  /** Minimum cosine similarity to suggest. Default 0.08. */
  minSimilarity?: number;
}

/**
 * Suggest internal links for every page in the input set.
 * Deterministic. Pure. Safe to call with thousands of pages.
 */
export function suggestLinks(
  pages: LinkingPage[],
  opts: SuggestLinksOptions = {},
): LinkSuggestion[] {
  const perPage = opts.perPage ?? 5;
  const minSim = opts.minSimilarity ?? 0.08;

  // Build per-page tokens and TF maps
  const tfMaps = pages.map((p) => tf(tokenize(`${p.title}\n${p.text}`)));
  const idfMap = idf(tfMaps);
  const tfidfMaps = tfMaps.map((m) => tfidf(m, idfMap));

  const suggestions: LinkSuggestion[] = [];
  const pageByUrl = new Map(pages.map((p) => [p.url, p]));

  for (let i = 0; i < pages.length; i++) {
    const fromPage = pages[i];
    const fromVec = tfidfMaps[i];
    if (!fromPage || !fromVec) continue;
    const candidates: LinkSuggestion[] = [];

    for (let j = 0; j < pages.length; j++) {
      if (i === j) continue;
      const toPage = pages[j];
      const toVec = tfidfMaps[j];
      if (!toPage || !toVec) continue;
      if (fromPage.outLinks.includes(toPage.url)) continue;
      const sim = cosineSimilarity(fromVec, toVec);
      if (sim < minSim) continue;
      const importance = toPage.importance ?? 1;
      const score = sim * importance;
      candidates.push({
        fromUrl: fromPage.url,
        toUrl: toPage.url,
        toTitle: toPage.title,
        similarity: Math.round(sim * 1000) / 1000,
        suggestedAnchor: suggestAnchor(fromVec, toVec, toPage.title),
      });
      // Sort & cap per source page
      candidates.sort((a, b) => b.similarity - a.similarity);
      if (candidates.length > perPage) candidates.length = perPage;
    }

    suggestions.push(...candidates);
  }
  return suggestions;
}

/**
 * Find orphan pages — pages with zero internal links pointing to them.
 * Returns the URLs of orphans, sorted alphabetically.
 */
export function findOrphans(pages: LinkingPage[]): string[] {
  const incoming = new Map<string, number>();
  for (const p of pages) incoming.set(p.url, 0);
  for (const p of pages) {
    for (const link of p.outLinks) {
      if (incoming.has(link)) incoming.set(link, (incoming.get(link) ?? 0) + 1);
    }
  }
  return Array.from(incoming.entries())
    .filter(([, count]) => count === 0)
    .map(([url]) => url)
    .sort();
}
