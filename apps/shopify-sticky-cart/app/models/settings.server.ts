// Settings model — the single source of truth for the storefront widget.
// The signed App Proxy reads these rows directly, so admin changes are live
// without duplicating configuration into Shopify custom data.

import prisma from '../db.server';

export type StickyCartSettings = {
  id: string;
  shop: string;
  enabled: boolean;
  position: 'bottom' | 'top';
  showAfterScroll: boolean;
  showImage: boolean;
  showPrice: boolean;
  showVariantSelector: boolean;
  showQuantity: boolean;
  ctaLabel: string;
  ctaColor: string;
  ctaTextColor: string;
  quickBuyEnabled: boolean;
  quickBuyLabel: string;
  freeShipEnabled: boolean;
  freeShipThreshold: number;
  freeShipColor: string;
  freeShipMessage: string;
  freeShipSuccessMsg: string;
};

// Mirror of the Prisma defaults — used as the storefront fallback and as the
// initial form state before a merchant has ever saved.
export const DEFAULT_SETTINGS: Omit<StickyCartSettings, 'id' | 'shop'> = {
  enabled: true,
  position: 'bottom',
  showAfterScroll: true,
  showImage: true,
  showPrice: true,
  showVariantSelector: true,
  showQuantity: true,
  ctaLabel: 'Add to cart',
  ctaColor: '#7c5cff',
  ctaTextColor: '#ffffff',
  quickBuyEnabled: true,
  quickBuyLabel: 'Buy it now',
  freeShipEnabled: true,
  freeShipThreshold: 75,
  freeShipColor: '#34d399',
  freeShipMessage: "You're {{remaining}} away from free shipping!",
  freeShipSuccessMsg: "You've unlocked free shipping! 🎉",
};

/** Read the settings row for a shop, creating it from defaults on first run. */
export async function getSettings(shop: string): Promise<StickyCartSettings> {
  const row = await prisma.stickyCartSettings.upsert({
    where: { shop },
    create: { shop, ...DEFAULT_SETTINGS },
    update: {},
  });
  return rowToSettings(row);
}

/** Read-only fetch that never writes — safe for the storefront proxy path. */
export async function readSettings(shop: string): Promise<StickyCartSettings> {
  const row = await prisma.stickyCartSettings.findUnique({ where: { shop } });
  return row ? rowToSettings(row) : { id: 'default', shop, ...DEFAULT_SETTINGS };
}

/** Persist a partial update for the storefront App Proxy. */
export async function saveSettings(
  shop: string,
  patch: Partial<Omit<StickyCartSettings, 'id' | 'shop'>>,
): Promise<StickyCartSettings> {
  const row = await prisma.stickyCartSettings.upsert({
    where: { shop },
    create: { shop, ...DEFAULT_SETTINGS, ...patch },
    update: patch,
  });
  return rowToSettings(row);
}

type SettingsRow = Awaited<ReturnType<typeof prisma.stickyCartSettings.upsert>>;

function rowToSettings(row: SettingsRow): StickyCartSettings {
  return {
    id: row.id,
    shop: row.shop,
    enabled: row.enabled,
    position: row.position === 'top' ? 'top' : 'bottom',
    showAfterScroll: row.showAfterScroll,
    showImage: row.showImage,
    showPrice: row.showPrice,
    showVariantSelector: row.showVariantSelector,
    showQuantity: row.showQuantity,
    ctaLabel: row.ctaLabel,
    ctaColor: row.ctaColor,
    ctaTextColor: row.ctaTextColor,
    quickBuyEnabled: row.quickBuyEnabled,
    quickBuyLabel: row.quickBuyLabel,
    freeShipEnabled: row.freeShipEnabled,
    freeShipThreshold: row.freeShipThreshold,
    freeShipColor: row.freeShipColor,
    freeShipMessage: row.freeShipMessage,
    freeShipSuccessMsg: row.freeShipSuccessMsg,
  };
}

/**
 * The exact JSON shape the storefront block consumes. Kept separate from the
 * DB row so we can evolve internal columns without breaking the theme contract.
 */
export function serializeForStorefront(s: StickyCartSettings) {
  return {
    enabled: s.enabled,
    position: s.position,
    showAfterScroll: s.showAfterScroll,
    showImage: s.showImage,
    showPrice: s.showPrice,
    showVariantSelector: s.showVariantSelector,
    showQuantity: s.showQuantity,
    cta: { label: s.ctaLabel, color: s.ctaColor, textColor: s.ctaTextColor },
    quickBuy: { enabled: s.quickBuyEnabled, label: s.quickBuyLabel },
    freeShip: {
      enabled: s.freeShipEnabled,
      threshold: s.freeShipThreshold,
      color: s.freeShipColor,
      message: s.freeShipMessage,
      successMessage: s.freeShipSuccessMsg,
    },
  };
}
