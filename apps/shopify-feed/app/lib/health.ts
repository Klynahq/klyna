// Klyna Feed — feed health report.
//
// After items are resolved, computeHealth() scores the feed against the target
// channel's required/recommended fields and a set of quality heuristics
// (title length, description length, GTIN presence, image https, etc). The
// result groups issues by field with affected counts and sample ids so the UI
// can show "23 items missing brand" instead of 23 separate rows.

import type { Channel, FeedField, FeedHealth, HealthIssue } from './types';
import { CHANNELS } from './channels';

interface Accumulator {
  field: FeedField | 'general';
  severity: 'error' | 'warn' | 'info';
  message: string;
  count: number;
  samples: string[];
}

const TITLE_MAX = 150;
const DESC_MIN = 30;

export function computeHealth(
  channel: Channel,
  items: Record<FeedField, string>[],
): FeedHealth {
  const def = CHANNELS[channel];
  const buckets = new Map<string, Accumulator>();

  const bump = (
    key: string,
    field: FeedField | 'general',
    severity: 'error' | 'warn' | 'info',
    message: string,
    id: string,
  ) => {
    const existing = buckets.get(key);
    if (existing) {
      existing.count += 1;
      if (existing.samples.length < 5) existing.samples.push(id);
    } else {
      buckets.set(key, { field, severity, message, count: 1, samples: [id] });
    }
  };

  for (const item of items) {
    const id = item.id || '(no id)';

    // Required field coverage => errors (channel will reject the item).
    for (const field of def.required) {
      if (!item[field]) {
        bump(`req:${field}`, field, 'error', `Missing required field "${field}" — ${def.label} will reject these items`, id);
      }
    }
    // Recommended field coverage => warnings.
    for (const field of def.recommended) {
      if (!item[field]) {
        bump(`rec:${field}`, field, 'warn', `Missing recommended field "${field}" — hurts ranking on ${def.label}`, id);
      }
    }

    // Quality heuristics.
    if (item.title && item.title.length > TITLE_MAX) {
      bump('q:title-long', 'title', 'warn', `Title longer than ${TITLE_MAX} chars — gets truncated`, id);
    }
    if (item.description && item.description.length < DESC_MIN) {
      bump('q:desc-short', 'description', 'warn', `Description shorter than ${DESC_MIN} chars — too thin to convert`, id);
    }
    if (item.image_link && !item.image_link.startsWith('https://')) {
      bump('q:img-http', 'image_link', 'warn', 'Image link is not HTTPS — most channels require https image URLs', id);
    }
    if (!item.gtin && !item.mpn && !item.brand) {
      bump('q:no-uid', 'gtin', 'warn', 'No unique product identifier (gtin / mpn / brand) — limits matching', id);
    }
    if (item.availability && !['in stock', 'out of stock', 'preorder', 'backorder'].includes(item.availability)) {
      bump('q:avail-bad', 'availability', 'error', `Invalid availability value "${item.availability}"`, id);
    }
  }

  const issues: HealthIssue[] = Array.from(buckets.entries()).map(([key, acc]) => ({
    id: key,
    field: acc.field,
    severity: acc.severity,
    message: acc.message,
    count: acc.count,
    sampleIds: acc.samples,
  }));

  // Sort: errors first, then by affected count desc.
  const sevRank = { error: 0, warn: 1, info: 2 } as const;
  issues.sort((a, b) => sevRank[a.severity] - sevRank[b.severity] || b.count - a.count);

  const score = scoreFeed(items.length, issues);
  return { score, grade: gradeFor(score), issues };
}

// Score 0-100. Errors weigh ~3x warnings, normalized by item count so a big
// catalog with a few bad items doesn't crater the score.
function scoreFeed(itemCount: number, issues: HealthIssue[]): number {
  if (itemCount === 0) return 0;
  let penalty = 0;
  for (const issue of issues) {
    const share = issue.count / itemCount; // 0..1 of catalog affected
    const weight = issue.severity === 'error' ? 45 : issue.severity === 'warn' ? 15 : 5;
    penalty += share * weight;
  }
  return Math.max(0, Math.min(100, Math.round(100 - penalty)));
}

function gradeFor(score: number): FeedHealth['grade'] {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

export { gradeFor };
