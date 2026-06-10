/**
 * @klyna/core
 *
 * Shared SEO + content-analysis engine. Pure TypeScript, no DOM dependency,
 * no network access required, no paid-API dependencies. Runs in:
 *
 *  - Node (CI, scripts, server-side use)
 *  - Browsers (extension content scripts, web apps)
 *  - Cloudflare Workers / edge runtimes
 *  - PHP-WASM sidecars (for the WordPress plugin)
 *
 * Sub-modules:
 *  - audit:   On-page SEO + GEO audit for a single page.
 *  - schema:  JSON-LD generators for Organization, Article, FAQ, Product, etc.
 *  - linking: TF-IDF + cosine internal-link suggestion engine.
 */

export * from './audit/index.ts';
export * as schema from './schema/index.ts';
export * as linking from './linking/index.ts';

export const version = '0.1.0';
