import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/node';
import prisma from '../db.server';
import { FREE_REVIEW_LIMIT, getShopPlan } from '../lib/plans.server';
import { type Aggregate, buildProductJsonLd, recomputeProductRating } from '../lib/reviews.server';
import { authenticate } from '../shopify.server';

// Storefront App Proxy endpoint.
//
// Configure the proxy in the Partner dashboard as:
//   Subpath prefix: apps   ·   Subpath: reviews
//   Proxy URL: https://<app-host>/apps/reviews
//
// GET  /apps/reviews?productId=...&handle=...&title=...   → published reviews + aggregate + JSON-LD
// POST /apps/reviews (form: productId, rating, body, author…) → create a pending review
//
// `authenticate.public.appProxy` verifies the Shopify HMAC signature so the
// storefront can talk to us without exposing an admin token.

const PAGE_SIZE = 20;

function parsePhotos(raw: string): string[] {
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as string[]) : [];
  } catch {
    return [];
  }
}

function aggregateFromRow(
  row: { reviewCount: number; ratingValue: number; distribution: string } | null,
): Aggregate {
  if (!row) return { reviewCount: 0, ratingValue: 0, distribution: [0, 0, 0, 0, 0] };
  let distribution = [0, 0, 0, 0, 0];
  try {
    const parsed = JSON.parse(row.distribution);
    if (Array.isArray(parsed) && parsed.length === 5) distribution = parsed as number[];
  } catch {
    /* keep default */
  }
  return { reviewCount: row.reviewCount, ratingValue: row.ratingValue, distribution };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);
  if (!session) return json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const productId = url.searchParams.get('productId');
  const title = url.searchParams.get('title') ?? 'Product';
  const handle = url.searchParams.get('handle') ?? undefined;
  const page = Math.max(0, Number.parseInt(url.searchParams.get('page') ?? '0', 10) || 0);

  if (!productId) {
    return json({ error: 'Missing productId' }, { status: 400 });
  }

  const [reviews, ratingRow, total] = await Promise.all([
    prisma.review.findMany({
      where: { shop: session.shop, productId, status: 'published' },
      orderBy: { createdAt: 'desc' },
      skip: page * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.productRating.findUnique({
      where: { shop_productId: { shop: session.shop, productId } },
    }),
    prisma.review.count({ where: { shop: session.shop, productId, status: 'published' } }),
  ]);

  const aggregate = aggregateFromRow(ratingRow);

  const jsonLd = buildProductJsonLd({
    name: title,
    description: `Customer reviews for ${title}`,
    url: handle ? `https://${session.shop}/products/${handle}` : undefined,
    aggregate,
  });

  return json({
    aggregate,
    page,
    pageSize: PAGE_SIZE,
    total,
    hasMore: (page + 1) * PAGE_SIZE < total,
    reviews: reviews.map((r) => ({
      id: r.id,
      rating: r.rating,
      title: r.title,
      body: r.body,
      author: r.authorName,
      verified: r.verified,
      reply: r.reply,
      photos: parsePhotos(r.photos),
      createdAt: r.createdAt,
    })),
    jsonLd,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);
  if (!session) return json({ error: 'Unauthorized' }, { status: 401 });

  const form = await request.formData();
  const productId = String(form.get('productId') ?? '').trim();
  const productTitle = String(form.get('productTitle') ?? 'Product').trim();
  const productHandle = String(form.get('productHandle') ?? '').trim() || null;
  const rating = Math.min(
    5,
    Math.max(1, Number.parseInt(String(form.get('rating') ?? '0'), 10) || 0),
  );
  const body = String(form.get('body') ?? '').trim();
  const title = String(form.get('title') ?? '').trim() || null;
  const authorName = String(form.get('authorName') ?? '').trim();
  const authorEmail = String(form.get('authorEmail') ?? '').trim() || null;
  const token = String(form.get('token') ?? '').trim() || null;
  const planHandle = await getShopPlan(session.shop);
  const photosRaw =
    planHandle === 'growth' ? form.getAll('photos').map(String).filter(Boolean).slice(0, 6) : [];

  if (!productId || !rating || !body || !authorName) {
    return json({ error: 'Please add a rating, your name, and a review.' }, { status: 400 });
  }

  if (planHandle === 'free') {
    const reviewCount = await prisma.review.count({
      where: { shop: session.shop, status: { in: ['pending', 'published'] } },
    });
    if (reviewCount >= FREE_REVIEW_LIMIT) {
      return json(
        {
          error: `The Free plan supports up to ${FREE_REVIEW_LIMIT} reviews. Upgrade to collect more.`,
        },
        { status: 402 },
      );
    }
  }

  // A valid request token marks the review as a verified purchase.
  let verified = false;
  let orderId: string | null = null;
  if (token) {
    const req = await prisma.reviewRequest.findUnique({ where: { token } });
    if (req && req.shop === session.shop && req.productId === productId) {
      verified = true;
      orderId = req.orderId;
      await prisma.reviewRequest.update({
        where: { token },
        data: { status: 'reviewed', reviewedAt: new Date() },
      });
    }
  }

  // Auto-publish path: 4–5★ verified reviews when the merchant enabled it.
  const settings = await prisma.settings.findUnique({ where: { shop: session.shop } });
  const autoPublish = Boolean(settings?.autoPublish) && verified && rating >= 4;
  const status = autoPublish ? 'published' : 'pending';

  await prisma.review.create({
    data: {
      shop: session.shop,
      productId,
      productTitle,
      productHandle,
      orderId,
      rating,
      title,
      body,
      authorName,
      authorEmail,
      photos: JSON.stringify(photosRaw),
      verified,
      status,
      publishedAt: autoPublish ? new Date() : null,
      source: token ? 'request_email' : 'widget',
    },
  });

  // Recompute the local aggregate immediately on auto-publish. (The metafield
  // mirror is refreshed from the admin side on the next moderation action;
  // the widget reads live aggregates from this proxy regardless.)
  if (autoPublish) {
    await recomputeProductRating(session.shop, productId);
  }

  return json({
    ok: true,
    status,
    message: autoPublish
      ? 'Thanks! Your review is now live.'
      : 'Thanks! Your review was submitted and is awaiting approval.',
  });
};
