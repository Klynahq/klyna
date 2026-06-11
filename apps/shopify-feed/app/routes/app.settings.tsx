import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/node';
import { useActionData, useLoaderData, useNavigation, useSubmit } from '@remix-run/react';
import {
  Banner,
  BlockStack,
  Button,
  Card,
  Checkbox,
  InlineStack,
  Layout,
  Page,
  Text,
  TextField,
} from '@shopify/polaris';
import { useState } from 'react';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';
import { ensureShopSettings } from '../lib/feeds.server';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const settings = await ensureShopSettings(session.shop);
  const feedCount = await prisma.feed.count({ where: { shop: session.shop } });
  return {
    shop: session.shop,
    settings: {
      metafieldNamespace: settings.metafieldNamespace,
      defaultGoogleCategory: settings.defaultGoogleCategory ?? '',
      schedulePaused: settings.schedulePaused,
    },
    feedCount,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();

  const metafieldNamespace = String(form.get('metafieldNamespace') ?? 'klyna_feed').trim() || 'klyna_feed';
  const defaultGoogleCategory = String(form.get('defaultGoogleCategory') ?? '').trim() || null;
  const schedulePaused = form.get('schedulePaused') === 'true';

  await prisma.shopSettings.update({
    where: { shop: session.shop },
    data: { metafieldNamespace, defaultGoogleCategory, schedulePaused },
  });

  return json({ ok: 'Settings saved.' });
};

export default function SettingsPage() {
  const { shop, settings, feedCount } = useLoaderData<typeof loader>();
  const data = useActionData<typeof action>();
  const nav = useNavigation();
  const submit = useSubmit();
  const busy = nav.state !== 'idle';

  const [namespace, setNamespace] = useState(settings.metafieldNamespace);
  const [defaultCat, setDefaultCat] = useState(settings.defaultGoogleCategory);
  const [paused, setPaused] = useState(settings.schedulePaused);

  const ok = data && 'ok' in data ? data.ok : null;

  const save = () => {
    const fd = new FormData();
    fd.set('metafieldNamespace', namespace);
    fd.set('defaultGoogleCategory', defaultCat);
    fd.set('schedulePaused', String(paused));
    submit(fd, { method: 'post' });
  };

  return (
    <Page title="Settings" subtitle={`Connected to ${shop}`} backAction={{ url: '/app' }}>
      <Layout>
        {ok && (
          <Layout.Section>
            <Banner tone="success" onDismiss={() => undefined}>{String(ok)}</Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <BlockStack gap="100">
                <Text as="h2" variant="headingMd">Metafield overrides</Text>
                <Text as="p" tone="subdued">
                  Klyna reads per-product feed overrides from this metafield namespace.
                  Set a metafield like <code>{namespace}.google_product_category</code> on a
                  product and map a field to it to override the default for that product.
                </Text>
              </BlockStack>
              <TextField
                label="Metafield namespace"
                autoComplete="off"
                value={namespace}
                onChange={setNamespace}
              />

              <BlockStack gap="100">
                <Text as="h2" variant="headingMd">Default Google product category</Text>
                <Text as="p" tone="subdued">
                  Applied when no collection-level taxonomy mapping matches a product. Use a
                  numeric id from the{' '}
                  <a
                    href="https://support.google.com/merchants/answer/6324436"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Google product taxonomy
                  </a>
                  .
                </Text>
              </BlockStack>
              <TextField
                label="Default category id"
                autoComplete="off"
                placeholder="e.g. 166"
                value={defaultCat}
                onChange={setDefaultCat}
              />

              <BlockStack gap="100">
                <Text as="h2" variant="headingMd">Scheduled refresh</Text>
                <Text as="p" tone="subdued">
                  Pause to stop all background rebuilds for this shop. Manual “Refresh now”
                  still works.
                </Text>
              </BlockStack>
              <Checkbox
                label="Pause scheduled refresh for all feeds"
                checked={paused}
                onChange={setPaused}
              />

              <InlineStack align="end">
                <Button variant="primary" onClick={save} loading={busy}>
                  Save settings
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">About this store</Text>
              <Text as="p" tone="subdued">
                {feedCount} feed{feedCount === 1 ? '' : 's'} configured. Klyna Feed runs on
                free infrastructure — no per-item billing, your catalog never leaves your
                own app host.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
