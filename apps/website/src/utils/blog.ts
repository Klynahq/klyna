import { getCollection, type CollectionEntry } from 'astro:content';
import readingTime from 'reading-time';

export type Post = CollectionEntry<'blog'>;

export type BlogTag = {
  tag: string;
  slug: string;
  count: number;
};

/** All published (non-draft) posts, newest first. */
export async function getPublishedPosts(): Promise<Post[]> {
  const posts = await getCollection('blog', ({ data }) => !data.draft);
  return posts.sort((a, b) => b.data.publishedAt.getTime() - a.data.publishedAt.getTime());
}

/** All featured posts (newest first). */
export async function getFeaturedPosts(): Promise<Post[]> {
  const posts = await getPublishedPosts();
  return posts.filter((p) => p.data.featured);
}

export function getTagSlug(tag: string): string {
  return tag
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** All unique tags across published posts, sorted by post count desc. */
export async function getAllTags(): Promise<BlogTag[]> {
  const posts = await getPublishedPosts();
  const counts = new Map<string, BlogTag>();
  for (const post of posts) {
    for (const tag of post.data.tags) {
      const slug = getTagSlug(tag);
      if (!slug) continue;
      const existing = counts.get(slug);
      counts.set(slug, {
        tag: existing?.tag ?? tag,
        slug,
        count: (existing?.count ?? 0) + 1,
      });
    }
  }
  return Array.from(counts.values()).sort((a, b) => b.count - a.count);
}

/** All published posts that include a given tag. */
export async function getPostsByTag(tagSlug: string): Promise<Post[]> {
  const posts = await getPublishedPosts();
  return posts.filter((p) => p.data.tags.some((tag) => getTagSlug(tag) === tagSlug));
}

/** Format a date as "Jun 10, 2026". */
export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** ISO 8601 datetime for schema.org / sitemap. */
export function isoDate(date: Date): string {
  return date.toISOString();
}

/** Estimate reading time in minutes from raw markdown/HTML body. */
export function estimateReadingTime(body: string): number {
  return Math.max(1, Math.round(readingTime(body).minutes));
}

/** Site-wide author metadata used in schema.org structured data. */
export const siteAuthor = {
  name: 'Klyna',
  url: 'https://klyna.dev',
  email: 'hello@klyna.dev',
  sameAs: ['https://github.com/klynahq', 'https://x.com/klynahq'],
};

/** Site-wide organization metadata. */
export const siteOrg = {
  name: 'Klyna',
  url: 'https://klyna.dev',
  logo: 'https://klyna.dev/favicon.svg',
  sameAs: ['https://github.com/klynahq', 'https://x.com/klynahq'],
  description:
    'Indie studio building open, modern tools for makers, creators, and growth-minded folks.',
};
