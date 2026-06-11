import { type ActionFunctionArgs } from '@remix-run/node';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';

// products/update — keep cached titles / handles fresh.
//
// When a merchant renames a product or changes its handle, our denormalized
// snapshot + subscription rows would otherwise drift, breaking the storefront
// link and the demand report copy. We patch the cache for every variant in the
// payload. Inventory is handled separately by inventory_levels/update.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  const product = payload as {
    id?: number | string;
    title?: string;
    handle?: string;
    variants?: { id: number | string; title?: string }[];
  };
  if (!product.id || !product.variants) return new Response();

  for (const v of product.variants) {
    const variantId = `gid://shopify/ProductVariant/${v.id}`;
    const variantTitle = v.title === 'Default Title' ? null : (v.title ?? null);

    await prisma.variantSnapshot.updateMany({
      where: { shop, variantId },
      data: {
        productTitle: product.title ?? undefined,
        productHandle: product.handle ?? undefined,
        variantTitle,
      },
    });

    await prisma.subscription.updateMany({
      where: { shop, variantId, status: { in: ['PENDING', 'NOTIFIED'] } },
      data: {
        productTitle: product.title ?? undefined,
        productHandle: product.handle ?? undefined,
        variantTitle,
      },
    });
  }

  return new Response();
};
