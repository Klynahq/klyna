/**
 * Typed message protocol between popup, background, and content script.
 * Every cross-context message goes through this so the popup never depends
 * on globals from the page.
 */

import type { AuditResult } from '@klyna/core';

export type KlynaMessage =
  | { type: 'GET_PAGE_HTML' }
  | { type: 'PAGE_HTML'; payload: { html: string; url: string; title: string } }
  | { type: 'AUDIT_RESULT'; payload: AuditResult }
  | { type: 'AUDIT_ERROR'; error: string };

export type AuditSnapshot = {
  html: string;
  url: string;
  title: string;
};

export const isKlynaMessage = (x: unknown): x is KlynaMessage =>
  typeof x === 'object' && x !== null && 'type' in x;
