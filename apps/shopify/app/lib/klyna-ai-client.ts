// ~/lib/klyna-ai-client — provider-agnostic AI client for Klyna products.
//
// Mirrors the contract of apps/wordpress/includes/class-ai.php:
//   • BYOK (bring your own key) — no Klyna-managed keys
//   • Free-tier providers only — OpenRouter `:free` models, Groq, Gemini
//   • Same system prompt voice across PHP and TS so suggestions feel consistent
//   • Caller passes a `cache` adapter so each app uses its own storage
//     (Prisma row, in-memory Map, KV, etc.)
//   • Caller passes a `usageQuota` adapter for per-shop daily caps
//
// Usage:
//   const ai = createAiClient({ provider: 'openrouter', apiKey, cache, quota });
//   const out = await ai.complete({ prompt: '...', maxTokens: 400 });

export type AiProvider = 'openrouter' | 'groq' | 'gemini' | 'off';

export type CompleteInput = {
  prompt: string;
  /** Override the default system prompt (keep brand voice if you do). */
  system?: string;
  /** 0..1 — defaults to 0.4 (consistent but not robotic). */
  temperature?: number;
  /** Hard cap on output tokens. Defaults to 400. */
  maxTokens?: number;
  /** Stable cache key; if omitted we hash prompt+system. */
  cacheKey?: string;
};

export type CompleteOutput = {
  text: string;
  /** Where the answer came from. `cache` = served from cache, no quota hit. */
  source: 'live' | 'cache';
  /** Set when something went wrong; text is then the user-readable fallback. */
  error?: string;
};

export type CacheAdapter = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
};

export type QuotaAdapter = {
  /** Increment today's counter. Returns the NEW count after increment. */
  incrementToday(): Promise<number>;
  /** Cap; if incrementToday() > limit, we refuse. */
  limit(): Promise<number>;
};

export type AiClientOpts = {
  provider: AiProvider;
  apiKey?: string;
  /** Override per-provider default model. */
  model?: string;
  cache?: CacheAdapter;
  quota?: QuotaAdapter;
  /** Cache TTL in seconds — default 86400 (24h). */
  cacheTtl?: number;
};

export type AiClient = {
  complete(input: CompleteInput): Promise<CompleteOutput>;
  /** Quick ping to verify the API key works. */
  test(): Promise<{ ok: boolean; message: string }>;
  provider: AiProvider;
};

const DEFAULT_SYSTEM = [
  'You are Klyna, an indie SEO + content assistant for online stores.',
  'You write plain, honest copy — no hype, no superlatives, no emoji.',
  'You never claim things you cannot verify from the input.',
  'You return only what was asked for, with no preface or commentary.',
].join(' ');

const PROVIDER_DEFAULTS: Record<Exclude<AiProvider, 'off'>, { model: string; url: string }> = {
  openrouter: {
    model: 'meta-llama/llama-3.3-70b-instruct:free',
    url: 'https://openrouter.ai/api/v1/chat/completions',
  },
  groq: {
    model: 'llama-3.3-70b-versatile',
    url: 'https://api.groq.com/openai/v1/chat/completions',
  },
  gemini: {
    model: 'gemini-2.0-flash',
    url: 'https://generativelanguage.googleapis.com/v1beta/models',
  },
};

// ── Default in-memory cache (good enough for short-lived dev servers) ──
function inMemoryCache(): CacheAdapter {
  const store = new Map<string, { value: string; expires: number }>();
  return {
    async get(key) {
      const hit = store.get(key);
      if (!hit) return null;
      if (Date.now() > hit.expires) {
        store.delete(key);
        return null;
      }
      return hit.value;
    },
    async set(key, value, ttlSeconds) {
      store.set(key, { value, expires: Date.now() + ttlSeconds * 1000 });
    },
  };
}

function noQuota(): QuotaAdapter {
  return {
    async incrementToday() {
      return 1;
    },
    async limit() {
      return 999_999;
    },
  };
}

async function hashKey(input: string): Promise<string> {
  // FNV-1a 64-bit-ish hex, browser+node safe, no crypto import.
  let h = 0xcbf29ce484222325n;
  for (let i = 0; i < input.length; i++) {
    h ^= BigInt(input.charCodeAt(i));
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, '0');
}

export function createAiClient(opts: AiClientOpts): AiClient {
  const provider = opts.provider;
  const cache = opts.cache ?? inMemoryCache();
  const quota = opts.quota ?? noQuota();
  const cacheTtl = opts.cacheTtl ?? 86400;

  if (provider === 'off' || !opts.apiKey) {
    return {
      provider,
      async complete() {
        return {
          text: '',
          source: 'live',
          error: 'AI is disabled. Configure a provider in Settings → AI assistant.',
        };
      },
      async test() {
        return { ok: false, message: 'AI provider not configured.' };
      },
    };
  }

  const conf = PROVIDER_DEFAULTS[provider];
  const model = opts.model ?? conf.model;

  async function callOpenAICompat(
    prompt: string,
    system: string,
    temperature: number,
    maxTokens: number,
  ): Promise<string> {
    const res = await fetch(conf.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${opts.apiKey}`,
        // OpenRouter encourages an HTTP-Referer for free-tier identification.
        ...(provider === 'openrouter'
          ? {
              'HTTP-Referer': 'https://klyna.dev',
              'X-Title': 'Klyna',
            }
          : {}),
      },
      body: JSON.stringify({
        model,
        temperature,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
      }),
    });
    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`${provider} ${res.status}: ${errBody.slice(0, 200)}`);
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = data.choices?.[0]?.message?.content ?? '';
    return text.trim();
  }

  async function callGemini(
    prompt: string,
    system: string,
    temperature: number,
    maxTokens: number,
  ): Promise<string> {
    const url = `${conf.url}/${model}:generateContent?key=${opts.apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature, maxOutputTokens: maxTokens },
      }),
    });
    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`gemini ${res.status}: ${errBody.slice(0, 200)}`);
    }
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    return text.trim();
  }

  async function dispatch(
    prompt: string,
    system: string,
    temperature: number,
    maxTokens: number,
  ): Promise<string> {
    if (provider === 'gemini') return callGemini(prompt, system, temperature, maxTokens);
    return callOpenAICompat(prompt, system, temperature, maxTokens);
  }

  return {
    provider,
    async complete(input) {
      const system = input.system ?? DEFAULT_SYSTEM;
      const temperature = input.temperature ?? 0.4;
      const maxTokens = input.maxTokens ?? 400;
      const rawKey = input.cacheKey ?? `${provider}|${model}|${system}|${input.prompt}`;
      const key = `ai:${await hashKey(rawKey)}`;

      const cached = await cache.get(key);
      if (cached) return { text: cached, source: 'cache' };

      const used = await quota.incrementToday();
      const limit = await quota.limit();
      if (used > limit) {
        return {
          text: '',
          source: 'live',
          error: `Daily AI cap reached (${used}/${limit}). Resets at 00:00 UTC.`,
        };
      }

      try {
        const text = await dispatch(input.prompt, system, temperature, maxTokens);
        await cache.set(key, text, cacheTtl);
        return { text, source: 'live' };
      } catch (err) {
        return {
          text: '',
          source: 'live',
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },

    async test() {
      try {
        const text = await dispatch('Reply with the single word: ready', DEFAULT_SYSTEM, 0, 8);
        if (text.toLowerCase().includes('ready')) {
          return { ok: true, message: `Connected via ${provider} (${model}).` };
        }
        return { ok: true, message: `Connected via ${provider} but got: ${text.slice(0, 60)}` };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : 'Unknown error',
        };
      }
    },
  };
}

// ── Prompt templates — shared with class-ai.php so suggestions feel uniform ──

export const PROMPTS = {
  seoTitle: (resource: string, brand: string, context: string) =>
    `Write 3 SEO title options (50-60 chars each) for this ${resource} on the store "${brand}". Be specific and search-friendly. One per line, no numbering, no quotes.\n\nContext:\n${context.slice(0, 600)}`,

  metaDescription: (resource: string, brand: string, context: string) =>
    `Write a meta description (130-155 chars) for this ${resource} on the store "${brand}". Include one concrete benefit. No emoji, no superlatives.\n\nContext:\n${context.slice(0, 800)}`,

  h1Suggestion: (pageTitle: string, body: string) =>
    `Write a single <h1> heading (40-70 chars) for a page titled "${pageTitle}". It should describe the page topic plainly. Output the heading text only, no tags, no quotes.\n\nPage content excerpt:\n${body.slice(0, 600)}`,

  expandThinContent: (title: string, body: string) =>
    `The page "${title}" is too thin (under 300 words). Write 2-3 short paragraphs (about 200 words total) that genuinely add useful detail. No filler, no marketing language. Output paragraphs only.\n\nExisting content:\n${body.slice(0, 800)}`,

  faqSet: (topic: string, context: string) =>
    `Generate 4 frequently-asked questions (with 1-2 sentence answers) about: ${topic}. Output as: Q: <question>\\nA: <answer>\\n\\n  — repeated. No numbering.\n\nContext:\n${context.slice(0, 600)}`,

  productBundle: (anchorProduct: string, coPurchasedTitles: string[]) =>
    `A shopper looking at "${anchorProduct}" also bought these: ${coPurchasedTitles.slice(0, 8).join(', ')}. Suggest the best 2-item bundle (just product names) and a 1-line reason a shopper would buy both. Format: BUNDLE: a + b\\nREASON: <one sentence>`,
};
