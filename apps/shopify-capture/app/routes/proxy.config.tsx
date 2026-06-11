import { type LoaderFunctionArgs, json } from '@remix-run/node';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';
import { parseWheel } from '../lib/popups';

// Public storefront endpoint (Shopify App Proxy).
// The Klyna Capture theme app embed fetches its active campaigns from here,
// then renders the matching popup client-side based on trigger + targeting.
//
// Proxy path (configured per app in the Partner dashboard) typically maps
// `/apps/klyna-capture/config` → this route. App Proxy requests are signed by
// Shopify; `authenticate.public.appProxy` verifies the signature.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);

  // No session means the request wasn't a valid signed proxy call.
  if (!session) {
    return json({ popups: [] }, { status: 401 });
  }

  const shop = session.shop;
  const popups = await prisma.popup.findMany({
    where: { shop, status: 'active' },
    orderBy: { updatedAt: 'desc' },
  });

  // Strip server-only fields; expose just what the widget needs to render.
  const payload = popups.map((p) => ({
    id: p.id,
    format: p.format,
    headline: p.headline,
    body: p.body,
    buttonLabel: p.buttonLabel,
    successMessage: p.successMessage,
    accentColor: p.accentColor,
    discountCode: p.discountCode,
    trigger: p.trigger,
    triggerSeconds: p.triggerSeconds,
    triggerScroll: p.triggerScroll,
    targetPages: p.targetPages,
    targetDevice: p.targetDevice,
    targetAudience: p.targetAudience,
    frequencyDays: p.frequencyDays,
    wheel: parseWheel(p.wheelSegments),
  }));

  return json(
    { popups: payload },
    {
      headers: {
        // Short cache so edits propagate fast but storefront isn't hammered.
        'Cache-Control': 'public, max-age=30',
        'Content-Type': 'application/json',
      },
    },
  );
};
