import { type ActionFunctionArgs } from '@remix-run/node';
import { authenticate } from '../shopify.server';
import { inventoryItemGid, syncByInventoryItem } from '../services/inventory.server';

// inventory_levels/update — the trigger for back-in-stock alerts.
//
// Shopify sends { inventory_item_id, location_id, available } whenever a
// variant's available count changes at a location. We resolve the inventory
// item to its variant, refresh our cached snapshot, and (if it flipped from
// sold-out to available) flush that variant's waitlist. flushVariant is
// idempotent + resend-guarded, so multi-location stores that emit several
// updates for the same variant won't double-alert.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload, admin } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  // `admin` is undefined if the app was uninstalled between the event and now.
  if (!admin) return new Response();

  const body = payload as { inventory_item_id?: number | string; available?: number };
  if (body.inventory_item_id == null) return new Response();

  // Fast path: nothing to do if the new level is zero or negative.
  if (typeof body.available === 'number' && body.available <= 0) {
    return new Response();
  }

  try {
    const gid = inventoryItemGid(body.inventory_item_id);
    const result = await syncByInventoryItem(admin, shop, gid);
    if (result.alertsSent > 0) {
      console.log(`[inventory] flushed ${result.alertsSent} alert(s) for ${result.variantId}`);
    }
  } catch (err) {
    // Never throw from a webhook — Shopify will retry, and a transient Admin
    // API hiccup shouldn't wedge the subscription.
    console.error('[inventory] sync failed', err);
  }

  return new Response();
};
