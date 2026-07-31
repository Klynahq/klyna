/**
 * Klyna design tokens.
 *
 * Centralized so every app — website, dashboard, browser extension,
 * WordPress admin, Shopify embed — renders with the same brand surface.
 */

export const brand = {
  name: 'Klyna',
  tagline: 'Tools that help your work get found.',
  domain: 'klyna.dev',
} as const;

export const palette = {
  // Neutrals (zinc-leaning, slightly warm)
  bg: '#0b0b0f',
  bgElevated: '#13131a',
  surface: '#1a1a23',
  border: '#2a2a35',
  text: '#f4f4f5',
  textMuted: '#a1a1aa',
  textDim: '#71717a',

  // Brand accent — electric violet
  accent: '#7c5cff',
  accentHover: '#9277ff',
  accentMuted: '#7c5cff20',

  // Semantic
  success: '#34d399',
  warning: '#fbbf24',
  danger: '#f87171',
} as const;

export const adminPalette = {
  canvas: '#f4f5f7',
  surface: '#ffffff',
  ink: '#202124',
  muted: '#61666d',
  subtle: '#8a8f98',
  border: '#d9dadd',
  borderStrong: '#b7b9bd',

  // High-contrast Klyna action color for light Shopify admin surfaces.
  accent: '#6847f5',
  accentHover: '#5738c9',
  accentSoft: '#eeeaff',
  accentBorder: '#cfc5ff',

  // Secondary data color. Status colors continue to come from Polaris.
  data: '#0f766e',
  dataSoft: '#e7f6f3',
} as const;

export const typography = {
  sans: '"Geist", "Inter", system-ui, -apple-system, "Segoe UI", sans-serif',
  mono: '"Geist Mono", "JetBrains Mono", ui-monospace, "SF Mono", monospace',
  display: '"Geist", "Inter", system-ui, sans-serif',
} as const;

export const spacing = {
  containerWide: '1280px',
  containerNarrow: '768px',
  radius: '12px',
  radiusSmall: '8px',
} as const;

export type Palette = typeof palette;
export type AdminPalette = typeof adminPalette;
export type Typography = typeof typography;
