import { type ActionFunctionArgs, type LoaderFunctionArgs, json, redirect } from '@remix-run/node';
import { useActionData, useLoaderData, useNavigation } from '@remix-run/react';
import { Page } from '@shopify/polaris';
import { authenticate } from '../shopify.server';
import { getProduct } from '../models/admin.server';
import { parseOfferForm, saveOffer } from '../models/offers.server';
import prisma from '../db.server';
import { EMPTY_VARIANT, type OfferEditorValues, OfferEditor, type PickedProduct } from '../components/OfferEditor';

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const offer = await prisma.offer.findFirst({
    where: { id: params.id, shop: session.shop },
    include: { variants: { orderBy: { label: 'asc' } } },
  });
  if (!offer) {
    throw new Response('Offer not found', { status: 404 });
  }

  const toPicked = (label: string): PickedProduct | null => {
    const v = offer.variants.find((x) => x.label === label);
    if (!v) return null;
    return {
      productGid: v.productGid,
      productHandle: v.productHandle,
      productTitle: v.productTitle,
      productImage: v.productImage,
      headline: v.headline,
      ctaText: v.ctaText,
      discountPercent: v.discountPercent,
    };
  };

  // For product/collection triggers, show the cached title where we have it;
  // the GID is always present so the picker can refresh it.
  const triggerLabel = offer.triggerType === 'cart_value' ? '' : offer.triggerValue;

  const values: OfferEditorValues = {
    name: offer.name,
    enabled: offer.enabled,
    triggerType: offer.triggerType as OfferEditorValues['triggerType'],
    triggerValue: offer.triggerValue,
    triggerLabel,
    placement: offer.placement as OfferEditorValues['placement'],
    splitA: offer.splitA,
    a: toPicked('A') ?? { ...EMPTY_VARIANT },
    b: toPicked('B'),
  };

  return { values };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const form = await request.formData();
  const { input, errors } = parseOfferForm(form);
  if (errors.length > 0) {
    return json({ errors }, { status: 400 });
  }

  for (const variant of input.variants) {
    const fresh = await getProduct(admin, variant.productGid);
    if (fresh) {
      variant.productHandle = fresh.handle;
      variant.productTitle = fresh.title;
      variant.productImage = fresh.image;
    }
  }

  await saveOffer(session.shop, input, params.id);
  return redirect('/app/offers');
};

export default function EditOffer() {
  const { values } = useLoaderData<typeof loader>();
  const data = useActionData<typeof action>();
  const nav = useNavigation();

  return (
    <Page title={`Edit · ${values.name}`} backAction={{ url: '/app/offers' }}>
      <OfferEditor
        initial={values}
        errors={data?.errors ?? []}
        submitting={nav.state === 'submitting'}
      />
    </Page>
  );
}
