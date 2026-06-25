// Klyna Reviews — shared server logic.
//
// Recomputes per-product aggregate ratings from published reviews and mirrors
// the result into a Shopify metafield so the storefront theme app extension can
// render stars + JSON-LD without ever touching our database at request time.
//
// Pure-ish: the aggregation is pure, the metafield sync takes a GraphQL client.

import prisma from '../db.server';

export const METAFIELD_NAMESPACE = 'klyna_reviews';
export const METAFIELD_KEY = 'aggregate';

export interface Aggregate {
  reviewCount: number;
  ratingValue: number; // rounded to 1 decimal, 0–5
  distribution: number[]; // [#1★, #2★, #3★, #4★, #5★]
}

/** Round to one decimal place, the precision Google shows in rich results. */
export function roundRating(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Recompute the aggregate for a single product from its PUBLISHED reviews and
 * persist it to ProductRating. Returns the fresh aggregate so the caller can
 * also push it to a Shopify metafield.
 */
export async function recomputeProductRating(
  shop: string,
  productId: string,
): Promise<Aggregate> {
  const reviews = await prisma.review.findMany({
    where: { shop, productId, status: 'published' },
    select: { rating: true },
  });

  const distribution = [0, 0, 0, 0, 0];
  let sum = 0;
  for (const r of reviews) {
    const star = Math.min(5, Math.max(1, r.rating));
    distribution[star - 1] = (distribution[star - 1] ?? 0) + 1;
    sum += star;
  }
  const count = reviews.length;
  const ratingValue = count > 0 ? roundRating(sum / count) : 0;

  await prisma.productRating.upsert({
    where: { shop_productId: { shop, productId } },
    create: {
      shop,
      productId,
      reviewCount: count,
      ratingSum: sum,
      ratingValue,
      distribution: JSON.stringify(distribution),
    },
    update: {
      reviewCount: count,
      ratingSum: sum,
      ratingValue,
      distribution: JSON.stringify(distribution),
    },
  });

  return { reviewCount: count, ratingValue, distribution };
}

/**
 * Mirror an aggregate into a product metafield. The theme app extension reads
 * `metafields.klyna_reviews.aggregate` (a JSON metafield) to render the stars
 * and the AggregateRating JSON-LD without any extra network call.
 *
 * `admin` is the GraphQL client from `authenticate.admin(request)`.
 */
export async function syncRatingMetafield(
  admin: { graphql: (query: string, opts?: { variables?: Record<string, unknown> }) => Promise<Response> },
  productId: string,
  aggregate: Aggregate,
): Promise<{ ok: boolean; errors?: string[] }> {
  const mutation = `#graphql
    mutation SetKlynaRating($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { id }
        userErrors { field message }
      }
    }`;

  const response = await admin.graphql(mutation, {
    variables: {
      metafields: [
        {
          ownerId: productId,
          namespace: METAFIELD_NAMESPACE,
          key: METAFIELD_KEY,
          type: 'json',
          value: JSON.stringify({
            ratingValue: aggregate.ratingValue,
            reviewCount: aggregate.reviewCount,
            distribution: aggregate.distribution,
          }),
        },
      ],
    },
  });

  const body = (await response.json()) as {
    data?: { metafieldsSet?: { userErrors?: { message: string }[] } };
  };
  const errors = body.data?.metafieldsSet?.userErrors?.map((e) => e.message) ?? [];
  return { ok: errors.length === 0, errors: errors.length ? errors : undefined };
}

/**
 * Recompute + sync in one shot. Safe to call after any moderation action.
 * The metafield sync is best-effort — a failure there must not roll back the
 * local aggregate (the storefront falls back to the App Proxy read).
 */
export async function refreshProductRating(
  admin: Parameters<typeof syncRatingMetafield>[0],
  shop: string,
  productId: string,
): Promise<Aggregate> {
  const aggregate = await recomputeProductRating(shop, productId);
  try {
    await syncRatingMetafield(admin, productId, aggregate);
  } catch (err) {
    console.error('Klyna Reviews: metafield sync failed', err);
  }
  return aggregate;
}

/**
 * Build the AggregateRating + Product JSON-LD for a product page. Reuses the
 * Build the same Product schema shape used across Klyna surfaces, while keeping
 * this deployable app self-contained.
 */
export function buildProductJsonLd(input: {
  name: string;
  description: string;
  url?: string;
  image?: string;
  aggregate: Aggregate;
}): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: input.name,
    description: input.description,
    ...(input.image ? { image: input.image } : {}),
    ...(input.url ? { url: input.url } : {}),
    ...(input.aggregate.reviewCount > 0
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: input.aggregate.ratingValue,
            reviewCount: input.aggregate.reviewCount,
          },
        }
      : {}),
  };
}

/** Stable, URL-safe token for a review-request magic link. */
export function makeRequestToken(): string {
  // 24 bytes of base36-ish entropy without pulling in a crypto dep surface.
  return (
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 12) +
    Math.random().toString(36).slice(2, 12)
  );
}
