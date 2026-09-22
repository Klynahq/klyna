import prisma from '../db.server';

export type UsageEventName =
  | 'dashboard_viewed'
  | 'bundle_builder_opened'
  | 'catalog_searched'
  | 'bundle_saved'
  | 'bundle_activated'
  | 'volume_discount_saved'
  | 'storefront_widget_loaded'
  | 'offer_sale_recorded';

function utcDay(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export async function recordUsageEvent(shop: string, event: UsageEventName): Promise<void> {
  await prisma.usageEvent
    .upsert({
      where: {
        shop_event_day: {
          shop,
          event,
          day: utcDay(),
        },
      },
      create: { shop, event, day: utcDay() },
      update: {},
    })
    .catch((error) => {
      console.warn(`Usage event could not be recorded: ${event}`, error);
    });
}
