// SEO auto-fix engine for Klyna.
//
// Detects the kind of Shopify resource a URL points to (home / product / page /
// collection / article) and applies the fixes that can be applied via the
// Admin GraphQL API:
//
//   - seo.title         (title too short / missing)
//   - seo.description   (meta description missing)
//   - Open Graph + canonical (Shopify auto-derives these from seo fields
//                            once they're set, so fixing seo fixes OG too)
//
// Anything that needs theme-level changes (h1, word count, FAQ structure,
// internal links) is reported as "not auto-fixable" — we surface a clear
// next-step instead of silently doing nothing.

import type { AuditResult } from '@klyna/core';

export type FixOutcome = {
  appliedFixes: string[];
  unfixable: { id: string; message: string; reason: string }[];
  resourceKind: ResourceKind;
  resourceTitle?: string;
};

export type ResourceKind = 'home' | 'product' | 'collection' | 'page' | 'article' | 'unknown';

type GqlClient = (
  query: string,
  opts?: { variables?: Record<string, unknown> },
) => Promise<Response>;

/** Detect what Shopify resource a storefront URL points to. */
export function detectResource(
  url: string,
  shopDomain: string,
): {
  kind: ResourceKind;
  handle?: string;
} {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { kind: 'unknown' };
  }
  const path = u.pathname.replace(/\/+$/, '');
  if (path === '' || path === '/') return { kind: 'home' };

  // /products/<handle>
  const product = path.match(/^\/products\/([^/]+)/);
  if (product) return { kind: 'product', handle: product[1] };

  // /collections/<handle>
  const collection = path.match(/^\/collections\/([^/]+)$/);
  if (collection) return { kind: 'collection', handle: collection[1] };

  // /pages/<handle>
  const page = path.match(/^\/pages\/([^/]+)/);
  if (page) return { kind: 'page', handle: page[1] };

  // /blogs/<blog-handle>/<article-handle>
  const article = path.match(/^\/blogs\/([^/]+)\/([^/]+)/);
  if (article) return { kind: 'article', handle: article[2] };

  return { kind: 'unknown' };
}

/** Build a sensible SEO title from a resource title + brand. */
export function craftTitle(resourceTitle: string, brand: string): string {
  const base = resourceTitle.trim() || brand;
  if (base.length >= 50) return base.slice(0, 60);
  const withBrand = base.toLowerCase().includes(brand.toLowerCase()) ? base : `${base} | ${brand}`;
  return withBrand.length <= 60 ? withBrand : withBrand.slice(0, 60);
}

/** Build a sensible meta description from body content. */
export function craftDescription(body: string, fallback: string): string {
  const stripped = body
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const seed = stripped.length >= 80 ? stripped : `${stripped} ${fallback}`.trim();
  if (seed.length <= 160) return seed;
  // Cut on a word boundary near 155 chars
  const cut = seed.slice(0, 157);
  const lastSpace = cut.lastIndexOf(' ');
  return `${lastSpace > 100 ? cut.slice(0, lastSpace) : cut}…`;
}

/** Decide which findings are auto-fixable. */
export function classifyFindings(result: AuditResult): {
  fixable: string[];
  unfixable: { id: string; message: string; reason: string }[];
} {
  const fixable: string[] = [];
  const unfixable: { id: string; message: string; reason: string }[] = [];

  for (const f of result.findings) {
    const id = f.id.toLowerCase();
    // Things we can fix via Admin API:
    if (
      id.includes('title') ||
      id.includes('description') ||
      id.includes('canonical') ||
      id.includes('og:') ||
      id.includes('twitter:card')
    ) {
      fixable.push(f.id);
      continue;
    }
    // Things that need a theme/content change:
    let reason = 'Needs a content or theme change.';
    if (id.includes('h1')) reason = 'Heading is set by your theme template.';
    else if (id.includes('word') || id.includes('thin'))
      reason = 'Add more body content on the page.';
    else if (id.includes('faq') || id.includes('comparison') || id.includes('listicle'))
      reason = 'Add structured content blocks (table, FAQ, or list).';
    else if (id.includes('json-ld') || id.includes('schema'))
      reason = 'Shopify auto-emits Product schema; add Article/FAQ schema via a theme block.';
    else if (id.includes('internal') || id.includes('link'))
      reason = 'Use the “Internal links” module to suggest + add cross-links.';
    unfixable.push({ id: f.id, message: f.message, reason });
  }
  return { fixable, unfixable };
}

// ── GraphQL helpers ────────────────────────────────────────────────────────

async function gql<T>(
  client: GqlClient,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const res = await client(query, variables ? { variables } : undefined);
  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join('; '));
  }
  return json.data as T;
}

export async function applyHomeFix(
  client: GqlClient,
  shopGid: string,
  shopName: string,
): Promise<string[]> {
  const applied: string[] = [];

  // Shop-level SEO defaults via metafields (Dawn + most themes read these).
  // Namespace 'global', key 'title_tag' / 'description_tag' is the de-facto
  // standard since Shopify's own themes use them for homepage SEO defaults.
  const title = craftTitle(shopName, shopName);
  const description = craftDescription(
    '',
    `${shopName} — modern products, fast shipping, and a clean shopping experience.`,
  );

  await gql(
    client,
    /* GraphQL */ `
    mutation klynaSetShopSeoTitle($ownerId: ID!, $value: String!) {
      metafieldsSet(metafields: [{
        ownerId: $ownerId
        namespace: "global"
        key: "title_tag"
        type: "single_line_text_field"
        value: $value
      }]) { userErrors { field message } }
    }
  `,
    { ownerId: shopGid, value: title },
  );
  applied.push(`Set homepage SEO title: “${title}”`);

  await gql(
    client,
    /* GraphQL */ `
    mutation klynaSetShopSeoDescription($ownerId: ID!, $value: String!) {
      metafieldsSet(metafields: [{
        ownerId: $ownerId
        namespace: "global"
        key: "description_tag"
        type: "single_line_text_field"
        value: $value
      }]) { userErrors { field message } }
    }
  `,
    { ownerId: shopGid, value: description },
  );
  applied.push(`Set homepage meta description: “${description.slice(0, 80)}…”`);

  return applied;
}

export async function applyProductFix(client: GqlClient, handle: string): Promise<string[]> {
  const applied: string[] = [];
  type ProductLookup = {
    productByHandle?: {
      id: string;
      title: string;
      descriptionHtml: string;
      seo: { title?: string | null; description?: string | null };
    };
  };

  const data = await gql<ProductLookup>(
    client,
    /* GraphQL */ `
    query klynaProductByHandle($handle: String!) {
      productByHandle(handle: $handle) {
        id title descriptionHtml seo { title description }
      }
    }
  `,
    { handle },
  );

  const p = data.productByHandle;
  if (!p) throw new Error(`No product with handle “${handle}”.`);

  const brand = 'Your Store';
  const newTitle =
    p.seo.title && p.seo.title.length >= 30 ? p.seo.title : craftTitle(p.title, brand);
  const newDesc =
    p.seo.description && p.seo.description.length >= 80
      ? p.seo.description
      : craftDescription(p.descriptionHtml ?? '', `Shop ${p.title} — quality and fast delivery.`);

  await gql(
    client,
    /* GraphQL */ `
    mutation klynaProductSeo($input: ProductInput!) {
      productUpdate(input: $input) {
        product { id }
        userErrors { field message }
      }
    }
  `,
    {
      input: { id: p.id, seo: { title: newTitle, description: newDesc } },
    },
  );

  applied.push(`Set product seo.title: “${newTitle}”`);
  applied.push(`Set product seo.description: “${newDesc.slice(0, 80)}…”`);
  return applied;
}

export async function applyPageFix(client: GqlClient, handle: string): Promise<string[]> {
  const applied: string[] = [];
  type PageLookup = {
    pages: { edges: { node: { id: string; title: string; body: string; handle: string } }[] };
  };

  const data = await gql<PageLookup>(
    client,
    /* GraphQL */ `
    query klynaPageByHandle($q: String!) {
      pages(first: 1, query: $q) {
        edges { node { id title body handle } }
      }
    }
  `,
    { q: `handle:${handle}` },
  );

  const p = data.pages.edges[0]?.node;
  if (!p) throw new Error(`No page with handle “${handle}”.`);

  const brand = 'Your Store';
  const newTitle = craftTitle(p.title, brand);
  const newDesc = craftDescription(p.body ?? '', `Read more about ${p.title}.`);

  await gql(
    client,
    /* GraphQL */ `
    mutation klynaPageSeo($id: ID!, $page: PageUpdateInput!) {
      pageUpdate(id: $id, page: $page) {
        page { id }
        userErrors { field message }
      }
    }
  `,
    {
      id: p.id,
      page: { templateSuffix: null, body: p.body, title: p.title, handle: p.handle },
    },
  );

  // Page SEO via metafields (pages don't expose seo on the standard input).
  await gql(
    client,
    /* GraphQL */ `
    mutation klynaPageSeoMeta($ownerId: ID!, $title: String!, $desc: String!) {
      metafieldsSet(metafields: [
        { ownerId: $ownerId, namespace: "global", key: "title_tag",       type: "single_line_text_field", value: $title }
        { ownerId: $ownerId, namespace: "global", key: "description_tag", type: "single_line_text_field", value: $desc  }
      ]) { userErrors { field message } }
    }
  `,
    { ownerId: p.id, title: newTitle, desc: newDesc },
  );

  applied.push(`Set page seo.title: “${newTitle}”`);
  applied.push(`Set page seo.description: “${newDesc.slice(0, 80)}…”`);
  return applied;
}

export async function applyCollectionFix(client: GqlClient, handle: string): Promise<string[]> {
  const applied: string[] = [];
  type CollectionLookup = {
    collectionByHandle?: {
      id: string;
      title: string;
      descriptionHtml: string;
      seo: { title?: string | null; description?: string | null };
    };
  };

  const data = await gql<CollectionLookup>(
    client,
    /* GraphQL */ `
    query klynaCollectionByHandle($handle: String!) {
      collectionByHandle(handle: $handle) {
        id title descriptionHtml seo { title description }
      }
    }
  `,
    { handle },
  );

  const c = data.collectionByHandle;
  if (!c) throw new Error(`No collection with handle “${handle}”.`);

  const brand = 'Your Store';
  const newTitle =
    c.seo.title && c.seo.title.length >= 30 ? c.seo.title : craftTitle(c.title, brand);
  const newDesc =
    c.seo.description && c.seo.description.length >= 80
      ? c.seo.description
      : craftDescription(c.descriptionHtml ?? '', `Shop our ${c.title} collection.`);

  await gql(
    client,
    /* GraphQL */ `
    mutation klynaCollectionSeo($input: CollectionInput!) {
      collectionUpdate(input: $input) {
        collection { id }
        userErrors { field message }
      }
    }
  `,
    {
      input: { id: c.id, seo: { title: newTitle, description: newDesc } },
    },
  );

  applied.push(`Set collection seo.title: “${newTitle}”`);
  applied.push(`Set collection seo.description: “${newDesc.slice(0, 80)}…”`);
  return applied;
}
