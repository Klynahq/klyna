// Klyna Feed — (de)serialization between Prisma rows and domain objects.
//
// SQLite has no JSON column type, so Feed.fieldMap / taxonomyMap / includeRules
// are stored as JSON strings. These helpers parse them defensively (a corrupt
// or legacy value falls back to defaults rather than throwing) and rebuild a
// FeedConfig the engine can consume.

import type {
  Channel,
  FeedConfig,
  FeedFormat,
  FieldMap,
  IncludeRules,
  TaxonomyMap,
} from './types';
import { defaultFieldMap, defaultIncludeRules } from './channels';

// A structural view of the Prisma Feed row (kept local to avoid importing the
// generated client's types into pure modules).
export interface FeedRow {
  id: string;
  shop: string;
  name: string;
  channel: string;
  format: string;
  language: string;
  currency: string;
  fieldMap: string;
  taxonomyMap: string;
  includeRules: string;
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed as T;
    return fallback;
  } catch {
    return fallback;
  }
}

// Merge stored include rules over defaults so missing keys are always present.
function hydrateRules(raw: string): IncludeRules {
  const base = defaultIncludeRules();
  const stored = parseJson<Partial<IncludeRules>>(raw, {});
  return {
    status: stored.status?.length ? stored.status : base.status,
    publishedOnly: stored.publishedOnly ?? base.publishedOnly,
    requireImage: stored.requireImage ?? base.requireImage,
    requirePrice: stored.requirePrice ?? base.requirePrice,
    collectionIds: stored.collectionIds ?? base.collectionIds,
    excludeTags: stored.excludeTags ?? base.excludeTags,
    minPrice: stored.minPrice ?? base.minPrice,
    maxPrice: stored.maxPrice ?? base.maxPrice,
  };
}

function hydrateFieldMap(raw: string): FieldMap {
  const stored = parseJson<FieldMap>(raw, {});
  // If nothing was stored yet, seed with the defaults.
  return Object.keys(stored).length ? stored : defaultFieldMap();
}

export interface HydrateExtras {
  metafieldNamespace: string;
  defaultGoogleCategory: string | null;
}

export function toFeedConfig(row: FeedRow, extras: HydrateExtras): FeedConfig {
  return {
    id: row.id,
    shop: row.shop,
    name: row.name,
    channel: row.channel as Channel,
    format: row.format as FeedFormat,
    language: row.language,
    currency: row.currency,
    fieldMap: hydrateFieldMap(row.fieldMap),
    taxonomyMap: parseJson<TaxonomyMap>(row.taxonomyMap, {}),
    includeRules: hydrateRules(row.includeRules),
    metafieldNamespace: extras.metafieldNamespace,
    defaultGoogleCategory: extras.defaultGoogleCategory,
  };
}
