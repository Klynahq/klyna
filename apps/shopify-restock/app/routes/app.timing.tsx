// Killer feature: smart per-customer notification timing.
//
// The merchant toggles smart timing here, sees the current queue, and can
// optionally have the AI assistant draft a polite "you're queued" preview
// line. Without an AI key the page degrades to the rule-based view.

import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/node';
import { useActionData, useLoaderData, useNavigation, useSubmit } from '@remix-run/react';
import {
  Badge,
  Banner,
  BlockStack,
  Card,
  Checkbox,
  DataTable,
  InlineGrid,
  InlineStack,
  Layout,
  Page,
  Text,
} from '@shopify/polaris';
import { useState } from 'react';
import prisma from '../db.server';
import { getAiClientForShop } from '../lib/ai.server';
import { getShopAiSettings } from '../lib/ai.server';
import { useEmbeddedRoute } from '../lib/embedded-routes';
import { getShopPlan, planSelectionUrl } from '../lib/plans.server';
import {
  NEXT_MORNING_HOUR,
  SEND_WINDOW_END_HOUR,
  SEND_WINDOW_START_HOUR,
  decideSendTime,
  timezoneForCountry,
} from '../lib/smart-timing.server';
import { getShopSettings } from '../services/waitlist.server';
import { authenticate } from '../shopify.server';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const [settings, ai, planHandle] = await Promise.all([
    getShopSettings(shop),
    getShopAiSettings(shop),
    getShopPlan(shop, admin),
  ]);

  const [queueCount, queuedSample, recentSent] = await Promise.all([
    prisma.queuedNotification.count({ where: { shop, status: 'QUEUED' } }),
    prisma.queuedNotification.findMany({
      where: { shop, status: 'QUEUED' },
      orderBy: { dueAt: 'asc' },
      take: 25,
    }),
    prisma.alert.count({ where: { shop, status: 'SENT' } }),
  ]);

  return {
    shop,
    planHandle,
    pricingUrl: planSelectionUrl(shop),
    enabled: settings.smartTimingEnabled,
    aiOff: ai.provider === 'off',
    queueCount,
    recentSent,
    queuedSample: queuedSample.map((q) => ({
      id: q.id,
      recipient: q.recipient,
      channel: q.channel,
      country: q.countryCode ?? '-',
      timezone: q.timezone ?? 'UTC',
      dueAt: q.dueAt.toISOString(),
      dueAtLabel: formatDateTime(q.dueAt, q.timezone ?? 'UTC'),
    })),
    window: {
      start: SEND_WINDOW_START_HOUR,
      end: SEND_WINDOW_END_HOUR,
      morning: NEXT_MORNING_HOUR,
    },
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();
  const intent = String(form.get('intent') ?? '');

  if (intent === 'toggle') {
    const enabled = form.get('enabled') === 'true';
    if (enabled && (await getShopPlan(shop, admin)) !== 'growth') {
      return json(
        { ok: false, planError: 'Smart timing is available on the Growth plan.' },
        { status: 403 },
      );
    }
    await prisma.shopSettings.upsert({
      where: { shop },
      update: { smartTimingEnabled: enabled },
      create: { shop, smartTimingEnabled: enabled },
    });
    return json({ ok: true });
  }

  if (intent === 'preview') {
    const countryCode = String(form.get('countryCode') ?? 'US').toUpperCase();
    const decision = decideSendTime(countryCode);
    const tz = timezoneForCountry(countryCode);
    const dueAtLabel = decision.dueAt ? formatDateTime(decision.dueAt, tz) : null;

    const ai = await getShopAiSettings(shop);
    if (ai.provider === 'off') {
      return json({
        preview: {
          tz,
          decision,
          dueAtLabel,
          aiText: null,
        },
      });
    }

    try {
      const client = await getAiClientForShop(shop);
      const prompt = `Draft one short, friendly subject line (max 60 chars) for a back-in-stock email that will be delivered to a shopper in ${countryCode} at a respectful local hour. No emoji, no exclamation marks, no curly quotes. Plain ASCII only. Reply with just the subject line, nothing else.`;
      const out = await client.complete({ prompt, maxTokens: 60 });
      return json({
        preview: {
          tz,
          decision,
          dueAtLabel,
          aiText: out.text.trim(),
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'AI request failed.';
      return json({ preview: { tz, decision, dueAtLabel, aiText: null }, aiError: message });
    }
  }

  return json({ ok: false });
};

function formatDateTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    timeZone,
    timeZoneName: 'short',
    year: 'numeric',
  }).format(date);
}

export default function Timing() {
  const embeddedRoute = useEmbeddedRoute();
  const {
    enabled,
    aiOff,
    queueCount,
    recentSent,
    queuedSample,
    window: w,
    planHandle,
    pricingUrl,
  } = useLoaderData<typeof loader>();
  const data = useActionData<typeof action>();
  const nav = useNavigation();
  const submit = useSubmit();
  const busy = nav.state === 'submitting';

  const [on, setOn] = useState(enabled);
  const [country, setCountry] = useState('US');

  const toggle = (next: boolean) => {
    setOn(next);
    const fd = new FormData();
    fd.set('intent', 'toggle');
    fd.set('enabled', String(next));
    submit(fd, { method: 'post', action: embeddedRoute('/app/timing') });
  };

  const runPreview = () => {
    const fd = new FormData();
    fd.set('intent', 'preview');
    fd.set('countryCode', country);
    submit(fd, { method: 'post', action: embeddedRoute('/app/timing') });
  };

  const preview = data && 'preview' in data ? data.preview : null;
  const aiError = data && 'aiError' in data ? data.aiError : null;

  const rows = queuedSample.map((q) => [
    q.recipient,
    q.channel,
    q.country,
    q.timezone,
    q.dueAtLabel,
  ]);

  return (
    <Page
      title="Smart timing"
      subtitle="Respect each shopper's local hours when alerts fire."
      backAction={{ url: embeddedRoute('/app') }}
    >
      <Layout>
        {planHandle === 'free' && (
          <Layout.Section>
            <Banner
              tone="info"
              title="Smart timing is included with Growth"
              action={{ content: 'View Growth plan', url: pricingUrl }}
            >
              <Text as="p">
                Preview the routing rule below, then upgrade to queue alerts for each shopper's
                local daytime.
              </Text>
            </Banner>
          </Layout.Section>
        )}
        {aiOff && (
          <Layout.Section>
            <Banner tone="info" title="Enable AI in Settings">
              <Text as="p" variant="bodyMd">
                Smart timing works without AI - the rule below fires immediately during local
                6am-10pm and queues for 10am local otherwise. Add a free-tier provider in Settings
                to also generate context-aware subject lines for queued alerts.
              </Text>
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                How it decides
              </Text>
              <Text as="p" variant="bodyMd" tone="subdued">
                For each restock alert, Klyna looks up the recipient's country from their captured
                locale and maps it to a timezone. If the local hour is between {w.start}:00 and{' '}
                {w.end}:00 the alert fires immediately. Outside that window it's parked in the queue
                and released at {w.morning}:00 local. Klyna checks the queue automatically
                throughout the day.
              </Text>
              <Checkbox
                label="Enable smart timing"
                checked={on}
                onChange={toggle}
                disabled={busy || planHandle !== 'growth'}
                helpText={
                  on
                    ? "On: alerts wait for each recipient's local daytime when needed."
                    : "Off: alerts fire the instant inventory returns, regardless of recipient's local time."
                }
              />
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <InlineGrid columns={{ xs: 1, md: 2 }} gap="300">
            <Card>
              <BlockStack gap="100">
                <Text as="p" variant="bodySm" tone="subdued">
                  In queue
                </Text>
                <Text as="p" variant="heading2xl" fontWeight="bold">
                  {String(queueCount)}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Waiting to send during recipients' local daytime.
                </Text>
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="100">
                <Text as="p" variant="bodySm" tone="subdued">
                  Released so far
                </Text>
                <Text as="p" variant="heading2xl" fontWeight="bold">
                  {String(recentSent)}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Smart-timed alerts delivered during shoppers' local daytime.
                </Text>
              </BlockStack>
            </Card>
          </InlineGrid>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">
                  Preview the decision
                </Text>
                {busy && <Badge tone="info">Working</Badge>}
              </InlineStack>
              <Text as="p" tone="subdued" variant="bodyMd">
                Try a country code (ISO alpha-2 - e.g. US, GB, JP) and see how the rule would route
                a shopper right now.
              </Text>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  runPreview();
                }}
              >
                <InlineStack gap="200" blockAlign="end">
                  <input
                    aria-label="Country code"
                    value={country}
                    onChange={(e) => setCountry(e.target.value.toUpperCase())}
                    maxLength={2}
                    style={{
                      padding: '8px 12px',
                      border: '1px solid #c9cccf',
                      borderRadius: 8,
                      width: 80,
                      textTransform: 'uppercase',
                    }}
                  />
                  <button
                    type="submit"
                    disabled={busy}
                    style={{
                      padding: '8px 14px',
                      borderRadius: 8,
                      border: '1px solid #2a2a35',
                      background: '#7c5cff',
                      color: '#fff',
                      cursor: busy ? 'wait' : 'pointer',
                    }}
                  >
                    {busy ? 'Working...' : 'Preview'}
                  </button>
                </InlineStack>
              </form>

              {preview && (
                <BlockStack gap="200">
                  <Text as="p" variant="bodyMd">
                    Timezone: <strong>{preview.tz}</strong> - local hour{' '}
                    {preview.decision.localHour}
                  </Text>
                  <Text as="p" variant="bodyMd">
                    Verdict:{' '}
                    {preview.decision.sendNow ? (
                      <Badge tone="success">Send immediately</Badge>
                    ) : (
                      <Badge tone="attention">
                        {`Queue for ${preview.dueAtLabel ?? 'next morning'}`}
                      </Badge>
                    )}
                  </Text>
                  {preview.aiText && (
                    <Banner tone="info" title="AI-drafted subject line">
                      <Text as="p" variant="bodyMd">
                        {preview.aiText}
                      </Text>
                    </Banner>
                  )}
                </BlockStack>
              )}

              {typeof aiError === 'string' && aiError && (
                <Banner tone="critical" title="AI request failed">
                  <Text as="p" variant="bodyMd">
                    {aiError}
                  </Text>
                </Banner>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        {queuedSample.length > 0 && (
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Currently queued (sample)
                </Text>
                <DataTable
                  columnContentTypes={['text', 'text', 'text', 'text', 'text']}
                  headings={['Recipient', 'Channel', 'Country', 'Timezone', 'Due at']}
                  rows={rows}
                />
              </BlockStack>
            </Card>
          </Layout.Section>
        )}
      </Layout>
    </Page>
  );
}
