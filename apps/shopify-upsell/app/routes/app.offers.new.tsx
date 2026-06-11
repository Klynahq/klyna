import { type ActionFunctionArgs, type LoaderFunctionArgs, json, redirect } from '@remix-run/node';
import { useActionData, useNavigation } from '@remix-run/react';
import { Page } from '@shopify/polaris';
import { authenticate } from '../shopify.server';
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

  // Refresh the product snapshot (title/image) from the Admin API so the
  // storefront always renders current data even if the picker was stale.
  for (const variant of input.variants) {
    const fresh = await getProduct(admin, variant.productGid);
    if (fresh) {
      variant.productHandle = fresh.handle;
      variant.productTitle = fresh.title;
      variant.productImage = fresh.image;
    }
  }

  await saveOffer(session.shop, input);
  return redirect('/app/offers');
};

export default function NewOffer() {
  const data = useActionData<typeof action>();
  const nav = useNavigation();

  return (
    <Page title="Create offer" backAction={{ url: '/app/offers' }}>
      <OfferEditor
        initial={EMPTY_OFFER}
        errors={data?.errors ?? []}
        submitting={nav.state === 'submitting'}
      />
    </Page>
  );
}
