import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * Blog collection. Powered by the Astro Content Layer API (v5+).
 * Drop any `.md` or `.mdx` file into `src/content/blog/` and it becomes
 * a published post (unless `draft: true`).
 */
const blog = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string().min(50).max(180),
    publishedAt: z.coerce.date(),
    updatedAt: z.coerce.date().optional(),
    author: z.string().default('Klyna'),
    tags: z.array(z.string()).default([]),
    category: z.enum(['SEO', 'GEO', 'Tools', 'Tutorials', 'Studio']).default('SEO'),
    draft: z.boolean().default(false),
    featured: z.boolean().default(false),
    ogImage: z.string().optional(),
  }),
});

export const collections = { blog };
