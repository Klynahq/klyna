import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/node';
import { Form, useActionData, useLoaderData, useNavigation } from '@remix-run/react';
import {
  Banner,
  BlockStack,
  Card,
  Checkbox,
  FormLayout,
  Layout,
  Page,
  Select,
  Text,
  TextField,
} from '@shopify/polaris';
import { useState } from 'react';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';

const DEFAULTS = {
  autoPublish: false,
  requestEnabled: true,
  requestDelayDays: 7,
  widgetAccent: '#7c5cff',
  showPhotos: true,
  emailFrom: '',
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const settings = await prisma.settings.findUnique({ where: { shop: session.shop } });
  return {
    settings: {
      autoPublish: settings?.autoPublish ?? DEFAULTS.autoPublish,
      requestEnabled: settings?.requestEnabled ?? DEFAULTS.requestEnabled,
      requestDelayDays: settings?.requestDelayDays ?? DEFAULTS.requestDelayDays,
      widgetAccent: settings?.widgetAccent ?? DEFAULTS.widgetAccent,
      showPhotos: settings?.showPhotos ?? DEFAULTS.showPhotos,
      emailFrom: settings?.emailFrom ?? DEFAULTS.emailFrom,
    },
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();

  const autoPublish = form.get('autoPublish') === 'on';
  const requestEnabled = form.get('requestEnabled') === 'on';
  const showPhotos = form.get('showPhotos') === 'on';
  const requestDelayDays = Math.min(
    90,
    Math.max(0, parseInt(String(form.get('requestDelayDays') ?? '7'), 10) || 0),
  );
  const widgetAccent = String(form.get('widgetAccent') ?? DEFAULTS.widgetAccent).trim();
  const emailFrom = String(form.get('emailFrom') ?? '').trim();

  const data = { autoPublish, requestEnabled, showPhotos, requestDelayDays, widgetAccent, emailFrom: emailFrom || null };

  await prisma.settings.upsert({
    where: { shop: session.shop },
    create: { shop: session.shop, ...data },
    update: data,
  });

  return json({ ok: true });
};

export default function SettingsPage() {
  const { settings } = useLoaderData<typeof loader>();
  const data = useActionData<typeof action>();
  const nav = useNavigation();
  const saving = nav.state === 'submitting';

  const [autoPublish, setAutoPublish] = useState(settings.autoPublish);
  const [requestEnabled, setRequestEnabled] = useState(settings.requestEnabled);
  const [showPhotos, setShowPhotos] = useState(settings.showPhotos);
  const [delay, setDelay] = useState(String(settings.requestDelayDays));
  const [accent, setAccent] = useState(settings.widgetAccent);
  const [emailFrom, setEmailFrom] = useState(settings.emailFrom);

  return (
    <Page title="Settings" backAction={{ url: '/app' }}>
      <Layout>
        {data && 'ok' in data && (
          <Layout.Section>
            <Banner tone="success" title="Settings saved" />
          </Layout.Section>
        )}

        <Layout.Section>
          <Form method="post">
            <BlockStack gap="400">
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">Moderation</Text>
                  <Checkbox
                    label="Auto-publish 4–5★ reviews from verified buyers"
                    helpText="Lower-rated reviews and unverified submissions still wait in the moderation queue."
                    checked={autoPublish}
                    onChange={setAutoPublish}
                  />
                  {/* Hidden mirrors so the boolean posts as on/off form values. */}
                  <input type="hidden" name="autoPublish" value={autoPublish ? 'on' : 'off'} />
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">Review requests</Text>
                  <Checkbox
                    label="Email customers automatically after fulfillment"
                    checked={requestEnabled}
                    onChange={setRequestEnabled}
                  />
                  <input type="hidden" name="requestEnabled" value={requestEnabled ? 'on' : 'off'} />
                  <FormLayout>
                    <Select
                      label="Wait before asking"
                      name="requestDelayDays"
                      options={[
                        { label: 'Immediately', value: '0' },
                        { label: '3 days', value: '3' },
                        { label: '7 days', value: '7' },
                        { label: '14 days', value: '14' },
                        { label: '30 days', value: '30' },
                      ]}
                      value={delay}
                      onChange={setDelay}
                    />
                    <TextField
                      label="From email"
                      name="emailFrom"
                      type="email"
                      autoComplete="email"
                      placeholder="reviews@your-store.com"
                      helpText="Defaults to KLYNA_FROM_EMAIL when blank."
                      value={emailFrom}
                      onChange={setEmailFrom}
                    />
                  </FormLayout>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">Storefront widget</Text>
                  <Checkbox
                    label="Show customer photos in the widget"
                    checked={showPhotos}
                    onChange={setShowPhotos}
                  />
                  <input type="hidden" name="showPhotos" value={showPhotos ? 'on' : 'off'} />
                  <TextField
                    label="Accent color"
                    name="widgetAccent"
                    autoComplete="off"
                    helpText="Star + button color. The theme block also exposes this in the editor."
                    value={accent}
                    onChange={setAccent}
                  />
                </BlockStack>
              </Card>

              <button
                type="submit"
                style={{
                  padding: '10px 16px',
                  borderRadius: 8,
                  border: 'none',
                  background: '#7c5cff',
                  color: '#fff',
                  fontWeight: 600,
                  cursor: 'pointer',
                  width: 'fit-content',
                }}
                disabled={saving}
              >
                {saving ? 'Saving…' : 'Save settings'}
              </button>
            </BlockStack>
          </Form>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
