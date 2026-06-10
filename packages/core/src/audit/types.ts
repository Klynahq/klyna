/**
 * Shared types for the audit engine.
 * Pure data shapes — safe to import in browser, Node, or PHP-WASM contexts.
 */

export type Severity = 'info' | 'warn' | 'error';

export type Category =
  | 'meta'
  | 'headings'
  | 'links'
  | 'images'
  | 'schema'
  | 'content'
  | 'social'
  | 'performance'
  | 'geo';

export interface Finding {
  /** Stable machine-readable id, e.g. `meta.title.missing`. */
  id: string;
  category: Category;
  severity: Severity;
  /** Human-readable summary shown in the UI. */
  message: string;
  /** Optional evidence — the offending element snippet, URL, etc. */
  evidence?: string;
  /** Actionable suggestion for the user. */
  fix?: string;
  /** Optional weight; higher = more impact on score. Defaults by severity. */
  weight?: number;
}

export interface PageContext {
  /** Canonical URL of the page being audited. */
  url: string;
  /** Raw HTML of the page. */
  html: string;
  /** Optional title hint (e.g. document.title from a browser context). */
  title?: string;
  /** Server response headers, if available. */
  headers?: Record<string, string>;
  /** Time the snapshot was captured. */
  fetchedAt?: string;
}

export interface AuditResult {
  url: string;
  /** 0-100. Computed from findings, deterministic. */
  score: number;
  /** Bucketed grade for the UI. */
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  findings: Finding[];
  /** Compact stats for UI summaries. */
  stats: {
    headings: { h1: number; h2: number; h3: number };
    links: { internal: number; external: number; total: number };
    images: { total: number; missingAlt: number };
    schema: { count: number; types: string[] };
    word_count: number;
    reading_time_minutes: number;
  };
  meta: {
    title?: string;
    description?: string;
    canonical?: string;
    ogTitle?: string;
    ogDescription?: string;
    ogImage?: string;
    twitterCard?: string;
    lang?: string;
    robots?: string;
  };
}

/** Default weight per severity if a finding does not specify one. */
export const defaultWeight = (sev: Severity): number =>
  sev === 'error' ? 15 : sev === 'warn' ? 5 : 0;
