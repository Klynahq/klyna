/**
 * @klyna/utils — tiny shared helpers.
 */

export type ProductStatus = 'live' | 'beta' | 'soon' | 'planning';

export interface Product {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  status: ProductStatus;
  surface: 'extension' | 'wordpress' | 'shopify' | 'web';
  href?: string;
}

/**
 * Single source of truth for the studio's product catalog.
 * The website, dashboard, and any docs hub all import from here.
 */
export const products: Product[] = [
  {
    slug: 'inspector',
    name: 'Klyna Inspector',
    tagline: 'On-page SEO in your browser.',
    description:
      'A browser extension that audits any page in one click — schema, meta, headings, links, performance. Pure client-side, zero tracking.',
    status: 'soon',
    surface: 'extension',
  },
  {
    slug: 'wp-suite',
    name: 'Klyna SEO Suite',
    tagline: 'Autopilot SEO for WordPress.',
    description:
      'Internal linking, schema, content freshness and FAQ generation — installed as a single plugin. Runs on your own server.',
    status: 'soon',
    surface: 'wordpress',
  },
  {
    slug: 'shopify',
    name: 'Klyna for Shopify',
    tagline: 'Organic growth for stores.',
    description:
      'Programmatic product page optimization, schema, internal linking and review collection for Shopify merchants.',
    status: 'planning',
    surface: 'shopify',
  },
];

export function statusLabel(status: ProductStatus): string {
  switch (status) {
    case 'live':
      return 'Available';
    case 'beta':
      return 'Beta';
    case 'soon':
      return 'Coming soon';
    case 'planning':
      return 'Planning';
  }
}

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
