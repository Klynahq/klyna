/**
 * Background service worker.
 *
 * Mostly a thin coordinator — the heavy lifting is done in the popup
 * (running @klyna/core directly). We use the background only for:
 *   - Optional caching of audit results across popup-close cycles.
 *   - Future: scheduled rechecks, sync to a dashboard, etc.
 */

import type { AuditResult } from '@klyna/core';

const CACHE_KEY_PREFIX = 'klyna:audit:';

chrome.runtime.onInstalled.addListener(() => {
  // Reserved for future first-run UX (open onboarding tab, etc.)
});

export async function cacheAudit(url: string, result: AuditResult): Promise<void> {
  await chrome.storage.local.set({ [`${CACHE_KEY_PREFIX}${url}`]: { result, at: Date.now() } });
}

export async function loadCachedAudit(url: string): Promise<AuditResult | null> {
  const raw = await chrome.storage.local.get(`${CACHE_KEY_PREFIX}${url}`);
  const entry = raw[`${CACHE_KEY_PREFIX}${url}`] as
    | { result: AuditResult; at: number }
    | undefined;
  if (!entry) return null;
  // 5-minute freshness window
  if (Date.now() - entry.at > 5 * 60 * 1000) return null;
  return entry.result;
}
