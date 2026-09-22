import { describe, expect, it } from 'vitest';
import { toCatalogProduct } from './admin.server';

const product = (overrides: Record<string, unknown> = {}) => ({
  id: 'gid://shopify/Product/1',
  title: 'Test product',
  handle: 'test-product',
  onlineStoreUrl: 'https://example.myshopify.com/products/test-product',
  tracksInventory: true,
  featuredImage: null,
  priceRangeV2: { minVariantPrice: { amount: '10.00', currencyCode: 'USD' } },
  variants: {
    nodes: [
      {
        id: 'gid://shopify/ProductVariant/1',
        price: '10.00',
        inventoryPolicy: 'DENY' as const,
        sellableOnlineQuantity: 3,
      },
    ],
  },
  ...overrides,
});

describe('catalog product availability', () => {
  it('marks a published in-stock variant as available', () => {
    expect(toCatalogProduct(product()).availabilityReason).toBe('available');
  });

  it('blocks products that are not published to the online store', () => {
    const result = toCatalogProduct(product({ onlineStoreUrl: null }));
    expect(result.available).toBe(false);
    expect(result.availabilityReason).toBe('unpublished');
  });

  it('chooses an available variant instead of an out-of-stock first variant', () => {
    const result = toCatalogProduct(
      product({
        variants: {
          nodes: [
            {
              id: 'gid://shopify/ProductVariant/1',
              price: '10.00',
              inventoryPolicy: 'DENY',
              sellableOnlineQuantity: 0,
            },
            {
              id: 'gid://shopify/ProductVariant/2',
              price: '12.00',
              inventoryPolicy: 'DENY',
              sellableOnlineQuantity: 4,
            },
          ],
        },
      }),
    );
    expect(result.variantGid).toBe('gid://shopify/ProductVariant/2');
    expect(result.price).toBe(12);
  });

  it('allows untracked inventory and continue-selling variants', () => {
    const untracked = toCatalogProduct(
      product({
        tracksInventory: false,
        variants: {
          nodes: [
            {
              id: 'gid://shopify/ProductVariant/1',
              price: '10.00',
              inventoryPolicy: 'DENY',
              sellableOnlineQuantity: 0,
            },
          ],
        },
      }),
    );
    const continueSelling = toCatalogProduct(
      product({
        variants: {
          nodes: [
            {
              id: 'gid://shopify/ProductVariant/1',
              price: '10.00',
              inventoryPolicy: 'CONTINUE',
              sellableOnlineQuantity: 0,
            },
          ],
        },
      }),
    );
    expect(untracked.available).toBe(true);
    expect(continueSelling.available).toBe(true);
  });
});
