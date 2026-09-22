import { describe, expect, it } from 'vitest';

import { quoteBundle } from './pricing';

describe('quoteBundle', () => {
  it('matches Shopify percentage rounding across cart lines', () => {
    const quote = quoteBundle(
      [
        { price: 949.95, quantity: 1 },
        { price: 885.95, quantity: 1 },
      ],
      'percentage',
      12,
    );

    expect(quote).toEqual({
      subtotal: 1835.9,
      total: 1615.6,
      savings: 220.3,
      savingsPercent: 12,
    });
  });

  it('applies a fixed discount once to the whole bundle', () => {
    const quote = quoteBundle(
      [
        { price: 40, quantity: 2 },
        { price: 25, quantity: 1 },
      ],
      'fixed_amount',
      15,
    );

    expect(quote).toEqual({
      subtotal: 105,
      total: 90,
      savings: 15,
      savingsPercent: 14,
    });
  });
});
