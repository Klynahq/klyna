/**
 * REST client for the Klyna WordPress plugin.
 *
 * In production (inside WP admin) the bootstrap script sets:
 *   window.klynaBoot = { restUrl, nonce, ajaxUrl, pluginUrl, settings }
 *
 * In dev (Vite preview) those globals are absent; we fall back to mock data
 * so the UI is still developable without spinning up WordPress.
 */

import { mockData } from './mocks.ts';

declare global {
  interface Window {
    klynaBoot?: {
      restUrl: string;
      nonce: string;
      ajaxUrl: string;
      pluginUrl: string;
      siteUrl: string;
      adminUrl: string;
      version: string;
      settings: Record<string, unknown>;
    };
  }
}

export const isDevMock = (): boolean => !window.klynaBoot;

export function boot() {
  return (
    window.klynaBoot ?? {
      restUrl: 'http://localhost:5174/__mock/',
      nonce: 'devmock',
      ajaxUrl: '',
      pluginUrl: '/',
      siteUrl: 'https://klyna.dev',
      adminUrl: '/wp-admin',
      version: '0.0.0-dev',
      settings: {
        enable_schema: true,
        enable_internal_links: true,
        enable_faq_schema: true,
        enable_breadcrumbs: true,
      },
    }
  );
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { restUrl, nonce } = boot();
  const url = restUrl.replace(/\/$/, '') + (path.startsWith('/') ? path : `/${path}`);
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-WP-Nonce': nonce,
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Klyna API ${res.status} ${res.statusText}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

export interface StatsResponse {
  posts_published: number;
  pages_published: number;
  avg_score: number;
  schema_coverage: number;
  internal_links_total: number;
  orphan_pages: number;
  posts_with_faq: number;
  last_audit: string | null;
  score_trend: Array<{ date: string; score: number }>;
}

export type Severity = 'info' | 'warn' | 'error';
export type FindingCategory = 'meta' | 'content' | 'links' | 'schema' | 'geo' | 'images';

export interface Finding {
  id: string;
  category: FindingCategory;
  severity: Severity;
  title: string;
  message: string;
  fix: string;
  fixable: boolean;
  ai_fixable: boolean;
  fix_meta: {
    action?: string;
    post_id?: number;
  };
}

export interface AiUsage {
  today_calls: number;
  daily_cap: number;
  provider: string;
  model: string;
}

export interface AiSuggestResponse {
  ok: boolean;
  task?: string;
  mode?: 'append' | 'choose' | 'replace_excerpt' | 'replace_title' | 'preview';
  text?: string;
  cached?: boolean;
  usage?: AiUsage;
  reason?: string;
  message?: string;
}

export interface PostSummary {
  id: number;
  title: string;
  url: string;
  edit_url: string;
  status: string;
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  issues: number;
  findings: Finding[];
  internal_links_in: number;
  internal_links_out: number;
  word_count: number;
  has_schema: boolean;
  modified: string;
}

export interface LinkSuggestion {
  from_id: number;
  from_title: string;
  from_url: string;
  to_id: number;
  to_title: string;
  to_url: string;
  similarity: number;
  anchor: string;
}

export interface SettingsResponse {
  enable_schema: boolean;
  enable_internal_links: boolean;
  enable_faq_schema: boolean;
  enable_breadcrumbs: boolean;
  enable_organization: boolean;
  enable_open_graph: boolean;
  organization_name: string;
  organization_logo: string;
  twitter_handle: string;
  internal_links_per_post: number;
  internal_links_min_similarity: number;
  ai_provider: 'openrouter' | 'groq' | 'gemini' | 'cloudflare' | 'ollama';
  ai_model: string;
  ai_api_key: string;
  ai_endpoint: string;
  ai_daily_cap: number;
}

export const api = {
  stats: () =>
    isDevMock() ? Promise.resolve(mockData.stats) : request<StatsResponse>('stats'),
  posts: () =>
    isDevMock() ? Promise.resolve(mockData.posts) : request<PostSummary[]>('posts'),
  linkSuggestions: () =>
    isDevMock()
      ? Promise.resolve(mockData.linkSuggestions)
      : request<LinkSuggestion[]>('internal-links/suggest'),
  settings: () =>
    isDevMock() ? Promise.resolve(mockData.settings) : request<SettingsResponse>('settings'),
  saveSettings: (data: Partial<SettingsResponse>) =>
    isDevMock()
      ? Promise.resolve({ ok: true, settings: { ...mockData.settings, ...data } })
      : request<{ ok: true; settings: SettingsResponse }>('settings', {
          method: 'POST',
          body: JSON.stringify(data),
        }),
  applyLink: (suggestion: LinkSuggestion) =>
    isDevMock()
      ? Promise.resolve({ ok: true as const })
      : request<{ ok: true; revision: number }>('internal-links/apply', {
          method: 'POST',
          body: JSON.stringify(suggestion),
        }),
  applyFix: (fix: Finding['fix_meta'] & { action: string }) =>
    isDevMock()
      ? Promise.resolve({ ok: true as const, message: 'Mock fix applied.' })
      : request<{ ok: boolean; message?: string; redirect?: string; reason?: string }>(
          'audit/fix',
          {
            method: 'POST',
            body: JSON.stringify(fix),
          },
        ),
  fixPost: (postId: number) =>
    isDevMock()
      ? Promise.resolve({
          ok: true as const,
          applied: [{ id: 'mock.fix', message: 'Mock fixed.' }],
          skipped: [],
        })
      : request<{
          ok: boolean;
          applied: Array<{ id: string; message: string }>;
          skipped: Array<{ id: string; reason: string }>;
        }>('audit/fix-post', {
          method: 'POST',
          body: JSON.stringify({ post_id: postId }),
        }),
  fixAll: () =>
    isDevMock()
      ? Promise.resolve({
          ok: true as const,
          total_applied: 0,
          posts: [],
        })
      : request<{
          ok: boolean;
          total_applied: number;
          posts: Array<{ post_id: number; title: string; applied: string[] }>;
        }>('audit/fix-all', { method: 'POST', body: JSON.stringify({}) }),
  auditOne: (id: number, content?: string) =>
    isDevMock()
      ? Promise.resolve(null)
      : request<{
          id: number;
          title: string;
          url: string;
          edit_url: string;
          score: number;
          grade: 'A' | 'B' | 'C' | 'D' | 'F';
          findings: Finding[];
          stats: Record<string, number | boolean>;
        }>('audit/' + id + (content ? '?content=' + encodeURIComponent(content) : '')),
  aiSuggest: (postId: number, findingId: string) =>
    isDevMock()
      ? Promise.resolve<AiSuggestResponse>({
          ok: true,
          task: 'mock',
          mode: 'preview',
          text: 'Mock AI suggestion — connect a provider in Settings to get real ones.',
          cached: false,
        })
      : request<AiSuggestResponse>('ai/suggest', {
          method: 'POST',
          body: JSON.stringify({ post_id: postId, finding_id: findingId }),
        }),
  aiApply: (params: { post_id: number; mode: string; text: string }) =>
    isDevMock()
      ? Promise.resolve({ ok: true as const, message: 'Mock applied.' })
      : request<{ ok: boolean; message?: string; reason?: string }>('ai/apply', {
          method: 'POST',
          body: JSON.stringify(params),
        }),
  aiTest: () =>
    isDevMock()
      ? Promise.resolve<AiSuggestResponse>({ ok: true, text: 'Mock connected.' })
      : request<AiSuggestResponse>('ai/test', { method: 'POST', body: JSON.stringify({}) }),
  aiUsage: () =>
    isDevMock()
      ? Promise.resolve<AiUsage>({ today_calls: 0, daily_cap: 100, provider: 'mock', model: 'mock' })
      : request<AiUsage>('ai/usage'),
};
