import { describe, expect, test } from 'vitest';
import { cartLinesDiscountsGenerateRun } from '../src/cart_lines_discounts_generate_run';

const PRODUCT_A = 'gid://shopify/Product/1';
const PRODUCT_B = 'gid://shopify/Product/2';
const VARIANT_A = 'gid://shopify/ProductVariant/11';
const VARIANT_B = 'gid://shopify/ProductVariant/22';

function line(id, productGid, variantGid, quantity) {
  return {
    id,
    quantity,
    merchandise: {
      __typename: 'ProductVariant',
      id: variantGid,
      product: { id: productGid },
    },
  };
}

function input(config, lines) {
  return {
    cart: { lines },
    discount: { metafield: config ? { jsonValue: config } : null },
  };
}

function fixedConfig(overrides = {}) {
  return {
    kind: 'fixed',
    items: [
      { productGid: PRODUCT_A, variantGid: VARIANT_A, quantity: 1 },
      { productGid: PRODUCT_B, variantGid: VARIANT_B, quantity: 1 },
    ],
    minItems: 0,
    discountType: 'percentage',
    discountValue: 10,
    title: 'Klyna Bundle · Test set',
    ...overrides,
  };
}

describe('Klyna bundle discount function', () => {
  test('applies a fixed bundle only when every configured item is present', () => {
    const result = cartLinesDiscountsGenerateRun(
      input(fixedConfig(), [
        line('line-a', PRODUCT_A, VARIANT_A, 1),
        line('line-b', PRODUCT_B, VARIANT_B, 1),
      ]),
    );

    expect(result.operations).toEqual([
      {
        productDiscountsAdd: {
          candidates: [
            {
              message: 'Klyna Bundle · Test set',
              targets: [
                { cartLine: { id: 'line-a', quantity: 1 } },
                { cartLine: { id: 'line-b', quantity: 1 } },
              ],
              value: { percentage: { value: 10 } },
            },
          ],
          selectionStrategy: 'FIRST',
        },
      },
    ]);
  });

  test('does not treat two of one product as a complete two-product bundle', () => {
    const result = cartLinesDiscountsGenerateRun(
      input(fixedConfig(), [line('line-a', PRODUCT_A, VARIANT_A, 2)]),
    );
    expect(result).toEqual({ operations: [] });
  });

  test('enforces configured quantities and discounts only the required units', () => {
    const config = fixedConfig({
      items: [
        { productGid: PRODUCT_A, variantGid: VARIANT_A, quantity: 2 },
        { productGid: PRODUCT_B, variantGid: VARIANT_B, quantity: 1 },
      ],
    });
    const result = cartLinesDiscountsGenerateRun(
      input(config, [
        line('line-a', PRODUCT_A, VARIANT_A, 3),
        line('line-b', PRODUCT_B, VARIANT_B, 1),
      ]),
    );
    const targets = result.operations[0].productDiscountsAdd.candidates[0].targets;
    expect(targets).toEqual([
      { cartLine: { id: 'line-a', quantity: 2 } },
      { cartLine: { id: 'line-b', quantity: 1 } },
    ]);
  });

  test('applies mix-and-match only after the eligible quantity threshold', () => {
    const config = fixedConfig({
      kind: 'mix_and_match',
      minItems: 3,
    });
    expect(
      cartLinesDiscountsGenerateRun(input(config, [line('line-a', PRODUCT_A, VARIANT_A, 2)])),
    ).toEqual({ operations: [] });

    const qualified = cartLinesDiscountsGenerateRun(
      input(config, [
        line('line-a', PRODUCT_A, VARIANT_A, 2),
        line('line-b', PRODUCT_B, VARIANT_B, 1),
      ]),
    );
    expect(qualified.operations[0].productDiscountsAdd.candidates[0].targets).toEqual([
      { cartLine: { id: 'line-a', quantity: 2 } },
      { cartLine: { id: 'line-b', quantity: 1 } },
    ]);
  });

  test('applies a fixed saving once across the bundle', () => {
    const result = cartLinesDiscountsGenerateRun(
      input(fixedConfig({ discountType: 'fixed_amount', discountValue: 15 }), [
        line('line-a', PRODUCT_A, VARIANT_A, 1),
        line('line-b', PRODUCT_B, VARIANT_B, 1),
      ]),
    );
    expect(result.operations[0].productDiscountsAdd.candidates[0].value).toEqual({
      fixedAmount: { amount: 15, appliesToEachItem: false },
    });
  });

  test('returns no operation for absent or malformed configuration', () => {
    const lines = [line('line-a', PRODUCT_A, VARIANT_A, 1)];
    expect(cartLinesDiscountsGenerateRun(input(null, lines))).toEqual({ operations: [] });
    expect(cartLinesDiscountsGenerateRun(input({ kind: 'fixed' }, lines))).toEqual({
      operations: [],
    });
  });
});
