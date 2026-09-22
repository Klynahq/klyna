import {
  type CartInput,
  type CartLinesDiscountsGenerateRunResult,
  ProductDiscountSelectionStrategy,
} from '../generated/api';

type BundleKind = 'fixed' | 'mix_and_match';
type DiscountType = 'percentage' | 'fixed_amount';

interface BundleItemConfig {
  productGid: string;
  variantGid?: string | null;
  quantity: number;
}

interface BundleDiscountConfig {
  kind: BundleKind;
  items: BundleItemConfig[];
  minItems: number;
  discountType: DiscountType;
  discountValue: number;
  title: string;
}

interface EligibleLine {
  id: string;
  quantity: number;
  productGid: string;
  variantGid: string;
}

function parseConfig(value: unknown): BundleDiscountConfig | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<BundleDiscountConfig>;
  if (candidate.kind !== 'fixed' && candidate.kind !== 'mix_and_match') return null;
  if (candidate.discountType !== 'percentage' && candidate.discountType !== 'fixed_amount') {
    return null;
  }
  if (!Number.isFinite(candidate.discountValue) || Number(candidate.discountValue) <= 0)
    return null;
  if (!Array.isArray(candidate.items) || candidate.items.length === 0) return null;

  const items = candidate.items
    .filter((item): item is BundleItemConfig => {
      return Boolean(
        item &&
          typeof item.productGid === 'string' &&
          item.productGid &&
          Number.isFinite(item.quantity) &&
          Number(item.quantity) > 0,
      );
    })
    .map((item) => ({
      productGid: item.productGid,
      variantGid: typeof item.variantGid === 'string' ? item.variantGid : null,
      quantity: Math.max(1, Math.floor(Number(item.quantity))),
    }));

  if (items.length !== candidate.items.length) return null;
  return {
    kind: candidate.kind,
    items,
    minItems: Math.max(1, Math.floor(Number(candidate.minItems) || 1)),
    discountType: candidate.discountType,
    discountValue: Number(candidate.discountValue),
    title:
      typeof candidate.title === 'string' && candidate.title.trim()
        ? candidate.title.trim().slice(0, 255)
        : 'Klyna bundle saving',
  };
}

function eligibleLines(input: CartInput): EligibleLine[] {
  return input.cart.lines.flatMap((line) => {
    if (line.merchandise.__typename !== 'ProductVariant') return [];
    return [
      {
        id: line.id,
        quantity: line.quantity,
        productGid: line.merchandise.product.id,
        variantGid: line.merchandise.id,
      },
    ];
  });
}

function itemMatches(line: EligibleLine, item: BundleItemConfig): boolean {
  return item.variantGid
    ? line.variantGid === item.variantGid
    : line.productGid === item.productGid;
}

function fixedTargets(lines: EligibleLine[], items: BundleItemConfig[]) {
  const targets: { cartLine: { id: string; quantity: number } }[] = [];

  for (const item of items) {
    let remaining = item.quantity;
    for (const line of lines) {
      if (remaining === 0 || !itemMatches(line, item)) continue;
      const quantity = Math.min(remaining, line.quantity);
      if (quantity > 0) {
        targets.push({ cartLine: { id: line.id, quantity } });
        remaining -= quantity;
      }
    }
    if (remaining > 0) return [];
  }

  return targets;
}

function mixAndMatchTargets(lines: EligibleLine[], items: BundleItemConfig[], minItems: number) {
  const matches = lines.filter((line) => items.some((item) => itemMatches(line, item)));
  const quantity = matches.reduce((total, line) => total + line.quantity, 0);
  if (quantity < minItems) return [];
  return matches.map((line) => ({ cartLine: { id: line.id, quantity: line.quantity } }));
}

export function cartLinesDiscountsGenerateRun(
  input: CartInput,
): CartLinesDiscountsGenerateRunResult {
  const config = parseConfig(input.discount.metafield?.jsonValue);
  if (!config || input.cart.lines.length === 0) return { operations: [] };

  const lines = eligibleLines(input);
  const targets =
    config.kind === 'fixed'
      ? fixedTargets(lines, config.items)
      : mixAndMatchTargets(lines, config.items, config.minItems);
  if (targets.length === 0) return { operations: [] };

  const value =
    config.discountType === 'percentage'
      ? { percentage: { value: config.discountValue } }
      : { fixedAmount: { amount: config.discountValue, appliesToEachItem: false } };

  return {
    operations: [
      {
        productDiscountsAdd: {
          candidates: [{ message: config.title, targets, value }],
          selectionStrategy: ProductDiscountSelectionStrategy.First,
        },
      },
    ],
  };
}
