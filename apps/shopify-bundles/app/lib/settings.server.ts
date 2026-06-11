// Klyna Bundles — shop settings accessor.
//
// Settings are stored one row per shop. `getSettings` lazily creates the row
// with brand defaults so callers never have to null-check.

import prisma from '../db.server';

export async function getSettings(shop: string) {
  const existing = await prisma.shopSettings.findUnique({ where: { shop } });
  if (existing) return existing;
  return prisma.shopSettings.create({ data: { shop } });
}

export interface SettingsPatch {
  defaultDiscountType?: string;
  priceDisplay?: string;
  widgetHeading?: string;
  bundleHeading?: string;
  accentColor?: string;
  showSavingsBadge?: boolean;
  autoFbt?: boolean;
}

export async function updateSettings(shop: string, patch: SettingsPatch) {
  await getSettings(shop); // ensure the row exists
  return prisma.shopSettings.update({ where: { shop }, data: patch });
}
