import { type ActionFunctionArgs, type LoaderFunctionArgs, json, redirect } from '@remix-run/node';
import { useActionData, useNavigation } from '@remix-run/react';
import { Page } from '@shopify/polaris';
import { authenticate } from '../shopify.server';
import { useEmbeddedRoute } from '../lib/embedded-routes';
import { getProduct } from '../models/admin.server';
import { parseOfferForm, saveOffer } from '../models/offers.server';
import { EMPTY_OFFER, OfferEditor } from '../components/OfferEditor';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const form = await request.formData();
  const { input, errors } = parseOfferForm(form);
  if (errors.length > 0) {
    return json({ errors }, { status: 400 });
  }

  // Refresh the product snapshot when possible, but keep the picker data when
  // Shopify temporarily rejects the optional lookup.
  for (const variant of input.variants) {
    try {
      const fresh = await getProduct(admin, variant.productGid);
      if (fresh) {
        variant.productHandle = fresh.handle;
        variant.productTitle = fresh.title;
        variant.productImage = fresh.image;
      }
    } catch (error) {
      console.warn('[upsell] Using the product picker snapshot after refresh failed', {
        status: error instanceof Response ? error.status : 500,
      });
    }
  }

  try {
    await saveOffer(session.shop, input);
    return redirect('/app/offers');
  } catch (error) {
    console.error('[upsell] Offer save failed', {
      status: error instanceof Response ? error.status : 500,
      message: error instanceof Error ? error.message : 'Response error',
    });
    return json(
      { errors: ['We could not save this offer. Please try again.'] },
      { status: 500 },
    );
  }
};

export default function NewOffer() {
  const embeddedRoute = useEmbeddedRoute();
  const data = useActionData<typeof action>();
  const nav = useNavigation();

  return (
    <Page title="Create offer" backAction={{ url: embeddedRoute('/app/offers') }}>
      <OfferEditor
        initial={EMPTY_OFFER}
        errors={data?.errors ?? []}
        submitting={nav.state === 'submitting'}
      />
    </Page>
  );
}
