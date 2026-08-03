import { type ActionFunctionArgs, type LoaderFunctionArgs, json, redirect } from '@remix-run/node';
import { Form, useActionData, useLoaderData, useNavigation, useSearchParams } from '@remix-run/react';
import {
  BlockStack,
  Card,
  ChoiceList,
  InlineError,
  Layout,
  Page,
  Select,
  Text,
  TextField,
} from '@shopify/polaris';
import { useState } from 'react';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';
import { ensureShopSettings, newFeedToken, CHANNEL_FORMAT } from '../lib/feeds.server';
import { defaultFieldMap, defaultIncludeRules, CHANNELS } from '../lib/channels';
import type { Channel } from '../lib/types';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  await ensureShopSettings(session.shop);

  // Pull the store's currency so new feeds default correctly.
  const res = await admin.graphql(`#graphql
    query KlynaShopInfo { shop { currencyCode } }
  `);
  const payload = (await res.json()) as {
    data?: { shop: { currencyCode: string } };
  };
  const currency = payload.data?.shop.currencyCode ?? 'USD';

  return { currency };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();

  const name = String(form.get('name') ?? '').trim();
  const channel = String(form.get('channel') ?? 'google') as Channel;
  const currency = String(form.get('currency') ?? 'USD').trim() || 'USD';
  const language = String(form.get('language') ?? 'en').trim() || 'en';
  const refreshEveryMin = Number.parseInt(String(form.get('refreshEveryMin') ?? '360'), 10);

  if (!name) {
    return json({ error: 'Give the feed a name.' }, { status: 400 });
  }
  if (!CHANNELS[channel]) {
    return json({ error: 'Pick a valid channel.' }, { status: 400 });
  }

  const feed = await prisma.feed.create({
    data: {
      shop: session.shop,
      name,
      channel,
      format: CHANNEL_FORMAT[channel],
      currency,
      language,
      token: newFeedToken(),
      refreshEveryMin: Number.isFinite(refreshEveryMin) ? refreshEveryMin : 360,
      fieldMap: JSON.stringify(defaultFieldMap()),
      includeRules: JSON.stringify(defaultIncludeRules()),
      taxonomyMap: '{}',
    },
  });

  return redirect(`/app/feeds/${feed.id}`);
};

const REFRESH_OPTIONS = [
  { label: 'Manual only', value: '0' },
  { label: 'Every hour', value: '60' },
  { label: 'Every 6 hours', value: '360' },
  { label: 'Every 12 hours', value: '720' },
  { label: 'Daily', value: '1440' },
];

export default function NewFeed() {
  const { currency } = useLoaderData<typeof loader>();
  const data = useActionData<typeof action>();
  const nav = useNavigation();
  const [searchParams] = useSearchParams();
  const submitting = nav.state === 'submitting';

  const preset = (searchParams.get('channel') as Channel) || 'google';
  const [name, setName] = useState('');
  const [channel, setChannel] = useState<Channel>(CHANNELS[preset] ? preset : 'google');
  const [refresh, setRefresh] = useState('360');
  const [currencyVal, setCurrencyVal] = useState(currency);
  const [languageVal, setLanguageVal] = useState('en');

  const error = data && 'error' in data ? data.error : null;

  return (
    <Page title="New feed" backAction={{ url: '/app/feeds' }}>
      <Layout>
        <Layout.Section>
          <Card>
            <Form method="post">
              <BlockStack gap="400">
                <TextField
                  label="Feed name"
                  name="name"
                  autoComplete="off"
                  value={name}
                  onChange={setName}
                  helpText="Just for you — e.g. 'Google Shopping — US'."
                  requiredIndicator
                />

                <ChoiceList
                  title="Channel"
                  selected={[channel]}
                  onChange={(v) => setChannel(v[0] as Channel)}
                  choices={Object.values(CHANNELS).map((c) => ({
                    label: `${c.label} · ${c.format.toUpperCase()}`,
                    value: c.id,
                  }))}
                />
                {/* ChoiceList is controlled-only; the hidden input carries the value on submit. */}
                <input type="hidden" name="channel" value={channel} />

                <BlockStack gap="200">
                  <Text as="span" variant="bodySm" tone="subdued">
                    Format is set automatically: {CHANNELS[channel].label} ingests{' '}
                    {CHANNELS[channel].format === 'xml' ? 'Google Shopping XML' : 'a CSV catalog'}.
                  </Text>
                </BlockStack>

                <TextField
                  label="Currency"
                  name="currency"
                  autoComplete="off"
                  value={currencyVal}
                  onChange={setCurrencyVal}
                  helpText="ISO code — prices emit as e.g. '12.99 USD'."
                />

                <TextField
                  label="Language"
                  name="language"
                  autoComplete="off"
                  value={languageVal}
                  onChange={setLanguageVal}
                  helpText="ISO language code for the feed metadata."
                />

                <Select
                  label="Scheduled refresh"
                  name="refreshEveryMin"
                  options={REFRESH_OPTIONS}
                  value={refresh}
                  onChange={setRefresh}
                  helpText="How often Klyna rebuilds the feed in the background."
                />

                {error && <InlineError message={String(error)} fieldID="name" />}

                <div>
                  <button
                    type="submit"
                    disabled={submitting}
                    style={{
                      padding: '10px 16px',
                      borderRadius: 8,
                      border: 'none',
                      background: '#7c5cff',
                      color: 'white',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {submitting ? 'Creating…' : 'Create feed'}
                  </button>
                </div>
              </BlockStack>
            </Form>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
