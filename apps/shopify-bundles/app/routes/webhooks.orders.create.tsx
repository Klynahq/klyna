import { type ActionFunctionArgs } from '@remix-run/node';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';

// orders/create — attribute revenue to bundles, volume tiers, and FBT pairs so
// the admin home analytics reflect real sales. We match the order's line items
// against this shop's active offers and write one BundleSale ledger row per
// matched source. Attribution is best-effort: an order can contribute to more
// than one source if it contains, e.g., both a bundle and a volume-tier product.

interface WebhookLineItem {
  product_id?: number | string | null;
  quantity?: number;
  price?: string;
  total_discount?: string;
}

interface OrderPayload {
  admin_graphql_api_id?: string;
  id?: number | string;
  currency?: string;
  line_items?: WebhookLineItem[];
}

function gidFromProductId(id: number | string | null | undefined): string | null {
  if (id == null) return null;
  return `gid://shopify/Product/${id}`;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  const order = payload as OrderPayload;
  const orderGid = order.admin_graphql_api_id ?? `gid://shopify/Order/${order.id ?? 'unknown'}`;
  const currency = order.currency ?? 'USD';
  const lines = order.line_items ?? [];

  // Skip if we've already recorded this order (webhooks can be redelivered).
  const seen = await prisma.bundleSale.findFirst({ where: { shop, orderGid } });
  if (seen) return new Response();

  const orderProductGids = new Set(
    lines.map((l) => gidFromProductId(l.product_id)).filter((g): g is string => !!g),
  );

  // Load this shop's offers to attribute against.
  const [bundles, tiers, fbtAnchors] = await Promise.all([
    prisma.bundle.findMany({
      where: { shop, status: 'active' },
      include: { items: true },
    }),
    prisma.volumeTier.findMany({ where: { shop } }),
    prisma.fbtPair.findMany({ where: { shop } }),
  ]);

  const lineByGid = new Map<string, WebhookLineItem>();
  for (const l of lines) {
    const g = gidFromProductId(l.product_id);
    if (g) lineByGid.set(g, l);
  }

  const sales: {
    bundleId: string | null;
    source: string;
    itemsSold: number;
    grossAmount: number;
    discountAmount: number;
  }[] = [];

  // Bundle attribution: every bundle item is present in the order.
  for (const b of bundles) {
    const gids = b.items.map((it) => it.productGid);
    if (gids.length > 0 && gids.every((g) => orderProductGids.has(g))) {
      let gross = 0;
      let discount = 0;
      let units = 0;
      for (const g of gids) {
        const l = lineByGid.get(g);
        if (!l) continue;
        const qty = Number(l.quantity ?? 0);
        gross += Number(l.price ?? 0) * qty;
        discount += Number(l.total_discount ?? 0);
        units += qty;
      }
      sales.push({ bundleId: b.id, source: 'bundle', itemsSold: units, grossAmount: gross, discountAmount: discount });
    }
  }

  // Volume attribution: a tiered product was bought at or above a break point.
  const tierProductGids = new Set(tiers.map((t) => t.productGid));
  for (const g of tierProductGids) {
    const l = lineByGid.get(g);
    if (!l) continue;
    const qty = Number(l.quantity ?? 0);
    const minBreak = Math.min(...tiers.filter((t) => t.productGid === g).map((t) => t.minQuantity));
    if (qty >= minBreak) {
      sales.push({
        bundleId: null,
        source: 'volume',
        itemsSold: qty,
        grossAmount: Number(l.price ?? 0) * qty,
        discountAmount: Number(l.total_discount ?? 0),
      });
    }
  }

  // FBT attribution: the order contains an anchor and at least one of its
  // recommended partners (a recommendation likely converted).
  const fbtByAnchor = new Map<string, Set<string>>();
  for (const f of fbtAnchors) {
    const set = fbtByAnchor.get(f.anchorGid) ?? new Set<string>();
    set.add(f.recommendedGid);
    fbtByAnchor.set(f.anchorGid, set);
  }
  for (const [anchor, partners] of fbtByAnchor) {
    if (!orderProductGids.has(anchor)) continue;
    const matched = [...partners].filter((p) => orderProductGids.has(p));
    if (matched.length === 0) continue;
    let gross = 0;
    let units = 0;
    for (const g of matched) {
      const l = lineByGid.get(g);
      if (!l) continue;
      const qty = Number(l.quantity ?? 0);
      gross += Number(l.price ?? 0) * qty;
      units += qty;
    }
    sales.push({ bundleId: null, source: 'fbt', itemsSold: units, grossAmount: gross, discountAmount: 0 });
  }

  if (sales.length > 0) {
    await prisma.bundleSale.createMany({
      data: sales.map((s) => ({
        shop,
        bundleId: s.bundleId,
        orderGid,
        source: s.source,
        itemsSold: s.itemsSold,
        grossAmount: Math.round((s.grossAmount + Number.EPSILON) * 100) / 100,
        discountAmount: Math.round((s.discountAmount + Number.EPSILON) * 100) / 100,
        currency,
      })),
    });
  }

  return new Response();
};
