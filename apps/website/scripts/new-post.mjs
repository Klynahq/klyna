#!/usr/bin/env node
/**
 * new-post.mjs — generate a draft blog post stub from a title or JSON input.
 *
 * Usage:
 *   node scripts/new-post.mjs --title "My new post" --category SEO --tags seo,internal-linking
 *
 * Or pipe a JSON payload (good for CI):
 *   echo '{"title":"...","description":"...","body":"...","category":"SEO","tags":["seo"]}' \
 *     | node scripts/new-post.mjs --stdin
 *
 * The script writes an MDX file to src/content/blog/<slug>.mdx with valid
 * frontmatter. Body is left as a placeholder if not provided, so a human (or
 * a follow-up LLM call) can fill it in before the daily commit.
 */

import { writeFile, mkdir, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BLOG_DIR = join(__dirname, '..', 'src', 'content', 'blog');

const ALLOWED_CATEGORIES = ['SEO', 'GEO', 'Tools', 'Tutorials', 'Studio'];

function parseArgs(argv) {
  const out = { tags: [] };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--stdin') out.stdin = true;
    else if (a === '--title') out.title = argv[++i];
    else if (a === '--description') out.description = argv[++i];
    else if (a === '--category') out.category = argv[++i];
    else if (a === '--tags') out.tags = argv[++i].split(',').map((t) => t.trim()).filter(Boolean);
    else if (a === '--slug') out.slug = argv[++i];
    else if (a === '--body-file') out.bodyFile = argv[++i];
    else if (a === '--featured') out.featured = true;
    else if (a === '--draft') out.draft = true;
  }
  return out;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

function slugify(s) {
  return s
    .toLowerCase()
    .trim()
    .replace(/['"]+/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function escapeYaml(s) {
  if (typeof s !== 'string') return JSON.stringify(s);
  if (/[:#\[\]{}&*!|>'"%@`,]/.test(s) || s.startsWith('-') || s.includes('\n')) {
    return `'${s.replace(/'/g, "''")}'`;
  }
  return s;
}

function buildFrontmatter(data) {
  const today = new Date().toISOString().slice(0, 10);
  const lines = [
    '---',
    `title: ${escapeYaml(data.title)}`,
    `description: ${escapeYaml(data.description)}`,
    `publishedAt: ${data.publishedAt ?? today}`,
    `author: ${escapeYaml(data.author ?? 'Klyna')}`,
    `category: ${data.category ?? 'SEO'}`,
    `tags: [${data.tags.map((t) => escapeYaml(t)).join(', ')}]`,
  ];
  if (data.featured) lines.push('featured: true');
  if (data.draft) lines.push('draft: true');
  if (data.ogImage) lines.push(`ogImage: ${escapeYaml(data.ogImage)}`);
  lines.push('---', '');
  return lines.join('\n');
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const args = parseArgs(process.argv);

  /** @type {Record<string, any>} */
  let data = args;

  if (args.stdin) {
    const raw = await readStdin();
    if (!raw.trim()) {
      console.error('Error: --stdin specified but no input received.');
      process.exit(1);
    }
    data = { ...args, ...JSON.parse(raw) };
  }

  if (!data.title) {
    console.error(
      'Error: --title is required. Example:\n  node scripts/new-post.mjs --title "My post" --category SEO',
    );
    process.exit(1);
  }

  if (data.category && !ALLOWED_CATEGORIES.includes(data.category)) {
    console.error(
      `Error: category must be one of ${ALLOWED_CATEGORIES.join(', ')}. Got: ${data.category}`,
    );
    process.exit(1);
  }

  const slug = data.slug ?? slugify(data.title);
  const description =
    data.description ?? `Draft post on ${data.title}. Replace this description before publishing.`;
  const tags = Array.isArray(data.tags) ? data.tags : [];

  const frontmatter = buildFrontmatter({
    title: data.title,
    description,
    publishedAt: data.publishedAt,
    author: data.author,
    category: data.category ?? 'SEO',
    tags,
    featured: !!data.featured,
    draft: data.draft ?? !data.body,
    ogImage: data.ogImage,
  });

  let body = data.body;
  if (!body && data.bodyFile) {
    const { readFile } = await import('node:fs/promises');
    body = await readFile(data.bodyFile, 'utf8');
  }
  if (!body) {
    body = [
      `# ${data.title}`,
      '',
      '_Draft. Replace this content before publishing._',
      '',
      '## Why this matters',
      '',
      'Lead with the one-sentence claim.',
      '',
      '## The details',
      '',
      'Three to five short, citation-friendly sub-points.',
      '',
      '## What to do this week',
      '',
      'A practical, numbered checklist the reader can act on today.',
      '',
    ].join('\n');
  }

  await mkdir(BLOG_DIR, { recursive: true });
  const path = join(BLOG_DIR, `${slug}.mdx`);

  if (await exists(path)) {
    console.error(`Error: post already exists at ${path}.`);
    process.exit(2);
  }

  await writeFile(path, frontmatter + body, 'utf8');
  console.log(path);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
