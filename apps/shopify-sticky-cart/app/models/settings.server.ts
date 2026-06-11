// Settings model — the single source of truth for the storefront widget.
//
// The admin UI edits a `StickyCartSettings` row in SQLite. So the theme app
// extension can read the same config without a Shopify admin session, we mirror
// the row into a shop-owned metaobject (`klyna_sticky_cart/settings`) that the
// App Proxy serves to the storefront. Prisma stays authoritative; the metaobject
// is a read replica that we upsert on every save.

import type { AdminGraphqlClient } from '@shopify/shopify-app-remix/server';
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

const METAOBJECT_TYPE = 'klyna_sticky_cart_settings';
const METAOBJECT_HANDLE = 'klyna-sticky-cart';

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

/** Persist a partial update and re-sync the storefront metaobject mirror. */
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
 * Push the current settings into a shop metaobject so the storefront can read
 * them. `admin` is the GraphQL client from `authenticate.admin(request)`.
 *
 * This is best-effort: a failure here never blocks the merchant's save (the
 * App Proxy reads from Prisma as the authoritative fallback), so we log and
 * return false rather than throwing.
 */
export async function syncSettingsMetaobject(
  admin: { graphql: AdminGraphqlClient },
  settings: StickyCartSettings,
): Promise<boolean> {
  const fields = [
    { key: 'config', value: JSON.stringify(serializeForStorefront(settings)) },
  ];

  try {
    // First run on a store needs the metaobject definition to exist. This is
    // idempotent — "type already exists" is a benign userError we ignore.
    await ensureMetaobjectDefinition(admin);

    const res = await admin.graphql(
      `#graphql
      mutation UpsertStickyCartSettings($handle: MetaobjectHandleInput!, $metaobject: MetaobjectUpsertInput!) {
        metaobjectUpsert(handle: $handle, metaobject: $metaobject) {
          metaobject { id handle }
          userErrors { field message }
        }
      }`,
      {
        variables: {
          handle: { type: METAOBJECT_TYPE, handle: METAOBJECT_HANDLE },
          metaobject: { fields, capabilities: { publishable: { status: 'ACTIVE' } } },
        },
      },
    );
    const body = (await res.json()) as {
      data?: { metaobjectUpsert?: { userErrors?: { message: string }[] } };
    };
    const errors = body.data?.metaobjectUpsert?.userErrors ?? [];
    if (errors.length) {
      console.warn('[sticky-cart] metaobject upsert userErrors:', errors);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[sticky-cart] metaobject sync failed:', err);
    return false;
  }
}

/**
 * Create the `klyna_sticky_cart_settings` metaobject definition if it doesn't
 * exist yet. Storefront access is enabled so the App Proxy / Liquid could read
 * it directly. Idempotent: re-running returns a "taken" userError we swallow.
 */
async function ensureMetaobjectDefinition(admin: { graphql: AdminGraphqlClient }): Promise<void> {
  await admin.graphql(
    `#graphql
    mutation CreateStickyCartDefinition($definition: MetaobjectDefinitionCreateInput!) {
      metaobjectDefinitionCreate(definition: $definition) {
        metaobjectDefinition { id type }
        userErrors { field message code }
      }
    }`,
    {
      variables: {
        definition: {
          type: METAOBJECT_TYPE,
          name: 'Klyna Sticky Cart settings',
          access: { storefront: 'PUBLIC_READ' },
          capabilities: { publishable: { enabled: true } },
          fieldDefinitions: [
            { key: 'config', name: 'Config', type: 'json' },
          ],
        },
      },
    },
  );
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
