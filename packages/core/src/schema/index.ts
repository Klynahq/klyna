/**
 * JSON-LD schema generators. Pure data builders — no DOM, no network.
 * Output can be JSON.stringified and dropped into <script type="application/ld+json">.
 */

export interface OrganizationInput {
  name: string;
  url: string;
  logo?: string;
  description?: string;
  sameAs?: string[];
}

export function buildOrganization(input: OrganizationInput): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${input.url}#organization`,
    name: input.name,
    url: input.url,
    ...(input.logo ? { logo: input.logo } : {}),
    ...(input.description ? { description: input.description } : {}),
    ...(input.sameAs?.length ? { sameAs: input.sameAs } : {}),
  };
}

export interface WebSiteInput {
  name: string;
  url: string;
  publisherId?: string;
  inLanguage?: string;
}

export function buildWebSite(input: WebSiteInput): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${input.url}#website`,
    url: input.url,
    name: input.name,
    inLanguage: input.inLanguage ?? 'en-US',
    ...(input.publisherId ? { publisher: { '@id': input.publisherId } } : {}),
  };
}

export interface ArticleInput {
  url: string;
  headline: string;
  description: string;
  datePublished: string | Date;
  dateModified?: string | Date;
  authorName: string;
  authorUrl?: string;
  image?: string;
  keywords?: string[];
  articleSection?: string;
  inLanguage?: string;
  publisherId?: string;
}

const toIso = (d: string | Date) =>
  d instanceof Date ? d.toISOString() : new Date(d).toISOString();

export function buildBlogPosting(input: ArticleInput): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    '@id': `${input.url}#article`,
    headline: input.headline,
    description: input.description,
    url: input.url,
    datePublished: toIso(input.datePublished),
    dateModified: toIso(input.dateModified ?? input.datePublished),
    author: {
      '@type': 'Person',
      name: input.authorName,
      ...(input.authorUrl ? { url: input.authorUrl } : {}),
    },
    ...(input.publisherId ? { publisher: { '@id': input.publisherId } } : {}),
    mainEntityOfPage: { '@type': 'WebPage', '@id': input.url },
    inLanguage: input.inLanguage ?? 'en-US',
    ...(input.keywords?.length ? { keywords: input.keywords.join(', ') } : {}),
    ...(input.articleSection ? { articleSection: input.articleSection } : {}),
    ...(input.image ? { image: input.image } : {}),
  };
}

export interface FaqEntry {
  question: string;
  answer: string;
}

export function buildFAQPage(items: FaqEntry[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };
}

export interface BreadcrumbCrumb {
  name: string;
  url: string;
}

export function buildBreadcrumbList(crumbs: BreadcrumbCrumb[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: c.url,
    })),
  };
}

export interface ProductInput {
  name: string;
  description: string;
  image?: string;
  sku?: string;
  brand?: string;
  url?: string;
  price?: number;
  priceCurrency?: string;
  availability?:
    | 'InStock'
    | 'OutOfStock'
    | 'PreOrder'
    | 'BackOrder'
    | 'Discontinued'
    | 'LimitedAvailability';
  ratingValue?: number;
  reviewCount?: number;
}

export function buildProduct(input: ProductInput): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: input.name,
    description: input.description,
    ...(input.image ? { image: input.image } : {}),
    ...(input.sku ? { sku: input.sku } : {}),
    ...(input.brand ? { brand: { '@type': 'Brand', name: input.brand } } : {}),
    ...(input.url ? { url: input.url } : {}),
    ...(input.price !== undefined && input.priceCurrency
      ? {
          offers: {
            '@type': 'Offer',
            price: input.price,
            priceCurrency: input.priceCurrency,
            availability: `https://schema.org/${input.availability ?? 'InStock'}`,
            ...(input.url ? { url: input.url } : {}),
          },
        }
      : {}),
    ...(input.ratingValue !== undefined && input.reviewCount !== undefined
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: input.ratingValue,
            reviewCount: input.reviewCount,
          },
        }
      : {}),
  };
}
