import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/node';
import { useCallback, useState } from 'react';
import { Form, Link, useActionData, useLoaderData, useNavigation, useSubmit } from '@remix-run/react';
import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  EmptyState,
  FormLayout,
  InlineStack,
  Layout,
  Page,
  Select,
  Text,
  TextField,
} from '@shopify/polaris';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';
import { ctr, type Totals } from '../lib/analytics-shared';

type TimerRow = {
  id: string;
  name: string;
  headline: string;
  subtext: string;
  style: string;
  startsAt: string | null;
  endsAt: string | null;
  evergreenMinutes: number;
  expireAction: string;
  expireMessage: string;
  accentColor: string;
  enabled: boolean;
  targeting: string;
  totals: Totals;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const timers = await prisma.countdownTimer.findMany({
    where: { shop },
    orderBy: { createdAt: 'desc' },
    include: {
      impressions: { select: { views: true, clicks: true, conversions: true } },
    },
  });

  const rows: TimerRow[] = timers.map((t) => ({
    id: t.id,
    name: t.name,
    headline: t.headline,
    subtext: t.subtext,
    style: t.style,
    startsAt: t.startsAt ? t.startsAt.toISOString() : null,
    endsAt: t.endsAt ? t.endsAt.toISOString() : null,
    evergreenMinutes: t.evergreenMinutes,
    expireAction: t.expireAction,
    expireMessage: t.expireMessage,
    accentColor: t.accentColor,
    enabled: t.enabled,
    targeting: t.targeting,
    totals: t.impressions.reduce<Totals>(
      (a, i) => ({
        views: a.views + i.views,
        clicks: a.clicks + i.clicks,
        conversions: a.conversions + i.conversions,
      }),
      { views: 0, clicks: 0, conversions: 0 },
    ),
  }));

  return { shop, timers: rows };
};

// Build a Date from a datetime-local string, or null if blank.
function toDate(v: FormDataEntryValue | null): Date | null {
  const s = String(v ?? '').trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();
  const intent = String(form.get('intent') ?? '');

  if (intent === 'delete') {
    const id = String(form.get('id') ?? '');
    await prisma.countdownTimer.deleteMany({ where: { id, shop } });
    return json({ ok: true, message: 'Timer deleted.' });
  }

  if (intent === 'toggle') {
    const id = String(form.get('id') ?? '');
    const enabled = String(form.get('enabled') ?? '') === 'true';
    await prisma.countdownTimer.updateMany({ where: { id, shop }, data: { enabled } });
    return json({ ok: true, message: enabled ? 'Timer enabled.' : 'Timer disabled.' });
  }

  // Create / update.
  const style = String(form.get('style') ?? 'sale');
  const startsAt = toDate(form.get('startsAt'));
  const endsAt = toDate(form.get('endsAt'));

  if (style === 'sale' && !endsAt) {
    return json({ ok: false, message: 'Sale timers need an end date.' }, { status: 400 });
  }
  if (style === 'launch' && !startsAt) {
    return json({ ok: false, message: 'Launch timers need a start date.' }, { status: 400 });
  }
  if (style !== 'evergreen' && startsAt && endsAt && endsAt <= startsAt) {
    return json({ ok: false, message: 'End date must be after the start date.' }, { status: 400 });
  }

  const targeting = JSON.stringify({
    pageScope: String(form.get('pageScope') ?? 'all'),
    device: String(form.get('device') ?? 'all'),
  });

  const data = {
    shop,
    name: String(form.get('name') ?? 'Untitled timer').slice(0, 120),
    headline: String(form.get('headline') ?? '').slice(0, 200),
    subtext: String(form.get('subtext') ?? '').slice(0, 200),
    style,
    startsAt,
    endsAt,
    evergreenMinutes: Math.max(1, Number(form.get('evergreenMinutes') ?? 60) || 60),
    expireAction: String(form.get('expireAction') ?? 'hide'),
    expireMessage: String(form.get('expireMessage') ?? '').slice(0, 200),
    accentColor: String(form.get('accentColor') ?? '#7c5cff'),
    targeting,
  };

  const id = String(form.get('id') ?? '');
  if (id) {
    await prisma.countdownTimer.updateMany({ where: { id, shop }, data });
    return json({ ok: true, message: 'Timer updated.' });
  }
  await prisma.countdownTimer.create({ data: { ...data, enabled: true } });
  return json({ ok: true, message: 'Timer created.' });
};

const STYLE_OPTIONS = [
  { label: 'Sale — count down to an end date', value: 'sale' },
  { label: 'Launch — count down to a start date', value: 'launch' },
  { label: 'Evergreen — per-visitor countdown', value: 'evergreen' },
];

const EXPIRE_OPTIONS = [
  { label: 'Hide the timer', value: 'hide' },
  { label: 'Keep showing 00:00:00', value: 'keep' },
  { label: 'Swap to a message', value: 'message' },
];

function blankTimer(): TimerRow {
  return {
    id: '',
    name: '',
    headline: 'Hurry — sale ends soon!',
    subtext: '',
    style: 'sale',
    startsAt: null,
    endsAt: null,
    evergreenMinutes: 60,
    expireAction: 'hide',
    expireMessage: 'This offer has ended.',
    accentColor: '#7c5cff',
    enabled: true,
    targeting: '{}',
    totals: { views: 0, clicks: 0, conversions: 0 },
  };
}

// Convert an ISO string to the value a <input type="datetime-local"> expects.
function localValue(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toISOString().slice(0, 16);
}

export default function Timers() {
  const { timers } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const submit = useSubmit();
  const submitting = nav.state === 'submitting';

  const [editing, setEditing] = useState<TimerRow | null>(null);

  const startNew = useCallback(() => setEditing(blankTimer()), []);
  const startEdit = useCallback((t: TimerRow) => setEditing(t), []);

  return (
    <Page
      title="Countdown timers"
      backAction={{ url: '/app' }}
      primaryAction={{ content: 'New timer', onAction: startNew }}
    >
      <Layout>
        {actionData?.message && (
          <Layout.Section>
            <Card>
              <Text as="p" tone={actionData.ok ? 'success' : 'critical'}>
                {actionData.message}
              </Text>
            </Card>
          </Layout.Section>
        )}

        {editing && (
          <Layout.Section>
            <TimerEditor
              key={editing.id || 'new'}
              timer={editing}
              submitting={submitting}
              onCancel={() => setEditing(null)}
            />
          </Layout.Section>
        )}

        <Layout.Section>
          {timers.length === 0 && !editing ? (
            <Card>
              <EmptyState
                heading="Create your first countdown"
                action={{ content: 'New timer', onAction: startNew }}
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>Schedule a sale or launch countdown and drop the Klyna Urgency
                  countdown block into your theme.</p>
              </EmptyState>
            </Card>
          ) : (
            <BlockStack gap="300">
              {timers.map((t) => {
                const target = safeTargeting(t.targeting);
                return (
                  <Card key={t.id}>
                    <BlockStack gap="200">
                      <InlineStack align="space-between" blockAlign="center">
                        <InlineStack gap="200" blockAlign="center">
                          <Text as="h3" variant="headingSm">{t.name || 'Untitled timer'}</Text>
                          <Badge tone={t.enabled ? 'success' : undefined}>
                            {t.enabled ? 'Active' : 'Paused'}
                          </Badge>
                          <Badge>{styleLabel(t.style)}</Badge>
                        </InlineStack>
                        <InlineStack gap="200">
                          <Link to={`/app/timers/${t.id}/dynamic-copy`}>
                            <Button>AI dynamic copy</Button>
                          </Link>
                          <Button onClick={() => startEdit(t)}>Edit</Button>
                          <Button
                            onClick={() =>
                              submit(
                                { intent: 'toggle', id: t.id, enabled: String(!t.enabled) },
                                { method: 'post' },
                              )
                            }
                          >
                            {t.enabled ? 'Pause' : 'Enable'}
                          </Button>
                          <Button
                            variant="primary"
                            tone="critical"
                            onClick={() => {
                              if (confirm('Delete this timer?')) {
                                submit({ intent: 'delete', id: t.id }, { method: 'post' });
                              }
                            }}
                          >
                            Delete
                          </Button>
                        </InlineStack>
                      </InlineStack>

                      <Text as="p" variant="bodyMd">{t.headline}</Text>
                      <InlineStack gap="400">
                        <Detail label="Schedule" value={scheduleSummary(t)} />
                        <Detail label="On expiry" value={expireLabel(t.expireAction)} />
                        <Detail label="Pages" value={pageLabel(target.pageScope)} />
                        <Detail label="Device" value={deviceLabel(target.device)} />
                      </InlineStack>

                      <InlineStack gap="400">
                        <Detail label="Views" value={t.totals.views.toLocaleString()} />
                        <Detail label="Clicks" value={t.totals.clicks.toLocaleString()} />
                        <Detail label="CTR" value={`${ctr(t.totals)}%`} />
                        <Detail label="Conversions" value={t.totals.conversions.toLocaleString()} />
                      </InlineStack>
                    </BlockStack>
                  </Card>
                );
              })}
            </BlockStack>
          )}
        </Layout.Section>
      </Layout>
    </Page>
  );
}

function TimerEditor({
  timer,
  submitting,
  onCancel,
}: {
  timer: TimerRow;
  submitting: boolean;
  onCancel: () => void;
}) {
  const target = safeTargeting(timer.targeting);
  const [style, setStyle] = useState(timer.style);
  const [expireAction, setExpireAction] = useState(timer.expireAction);
  const [name, setName] = useState(timer.name);
  const [headline, setHeadline] = useState(timer.headline);
  const [subtext, setSubtext] = useState(timer.subtext);
  const [evergreenMinutes, setEvergreenMinutes] = useState(String(timer.evergreenMinutes));
  const [expireMessage, setExpireMessage] = useState(timer.expireMessage);

  return (
    <Card>
      <BlockStack gap="300">
        <Text as="h2" variant="headingMd">{timer.id ? 'Edit timer' : 'New timer'}</Text>
        <Form method="post">
          <input type="hidden" name="intent" value="save" />
          {timer.id && <input type="hidden" name="id" value={timer.id} />}
          {/* Polaris fields are controlled-only and Button does not accept
              `name`, so we mirror every controlled field into a hidden input
              that the native form actually posts. */}
          <input type="hidden" name="style" value={style} />
          <input type="hidden" name="expireAction" value={expireAction} />
          <input type="hidden" name="name" value={name} />
          <input type="hidden" name="headline" value={headline} />
          <input type="hidden" name="subtext" value={subtext} />
          <input type="hidden" name="evergreenMinutes" value={evergreenMinutes} />
          <input type="hidden" name="expireMessage" value={expireMessage} />
          <FormLayout>
            <TextField
              label="Internal name"
              value={name}
              onChange={setName}
              autoComplete="off"
              helpText='Only you see this. For example: "Black Friday banner".'
            />
            <TextField
              label="Headline"
              value={headline}
              onChange={setHeadline}
              autoComplete="off"
            />
            <TextField
              label="Subtext"
              value={subtext}
              onChange={setSubtext}
              autoComplete="off"
            />

            <Select
              label="Timer type"
              options={STYLE_OPTIONS}
              value={style}
              onChange={setStyle}
            />

            {style !== 'evergreen' && (
              <FormLayout.Group>
                <DateField
                  label="Starts at"
                  name="startsAt"
                  defaultValue={localValue(timer.startsAt)}
                />
                <DateField
                  label="Ends at"
                  name="endsAt"
                  defaultValue={localValue(timer.endsAt)}
                />
              </FormLayout.Group>
            )}

            {style === 'evergreen' && (
              <TextField
                label="Countdown length (minutes)"
                type="number"
                min={1}
                value={evergreenMinutes}
                onChange={setEvergreenMinutes}
                autoComplete="off"
                helpText="Each visitor sees a fresh countdown of this many minutes."
              />
            )}

            <Select
              label="When the countdown ends"
              options={EXPIRE_OPTIONS}
              value={expireAction}
              onChange={setExpireAction}
            />
            {expireAction === 'message' && (
              <TextField
                label="Expiry message"
                value={expireMessage}
                onChange={setExpireMessage}
                autoComplete="off"
              />
            )}

            <ColorField
              label="Accent color"
              name="accentColor"
              defaultValue={timer.accentColor}
            />

            {/* Polaris Select is controlled-only; for targeting we keep plain
                native selects so the values post with the uncontrolled form. */}
            <FormLayout.Group>
              <NativeSelect
                label="Show on pages"
                name="pageScope"
                defaultValue={target.pageScope}
                options={[
                  ['all', 'All pages'],
                  ['home', 'Home page'],
                  ['products', 'Product pages'],
                  ['collections', 'Collection pages'],
                  ['cart', 'Cart'],
                ]}
              />
              <NativeSelect
                label="Device"
                name="device"
                defaultValue={target.device}
                options={[
                  ['all', 'All devices'],
                  ['desktop', 'Desktop only'],
                  ['mobile', 'Mobile only'],
                ]}
              />
            </FormLayout.Group>

            <InlineStack gap="200">
              <Button submit variant="primary" loading={submitting}>
                {timer.id ? 'Save changes' : 'Create timer'}
              </Button>
              <Button onClick={onCancel}>Cancel</Button>
            </InlineStack>
          </FormLayout>
        </Form>
      </BlockStack>
    </Card>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <BlockStack gap="050">
      <Text as="span" variant="bodySm" tone="subdued">{label}</Text>
      <Text as="span" variant="bodyMd">{value}</Text>
    </BlockStack>
  );
}

function DateField({
  label,
  name,
  defaultValue,
}: {
  label: string;
  name: string;
  defaultValue: string;
}) {
  return (
    <Box>
      <Text as="span" variant="bodySm" tone="subdued">{label}</Text>
      <input
        type="datetime-local"
        name={name}
        defaultValue={defaultValue}
        style={inputStyle}
      />
    </Box>
  );
}

function ColorField({
  label,
  name,
  defaultValue,
}: {
  label: string;
  name: string;
  defaultValue: string;
}) {
  return (
    <Box>
      <Text as="span" variant="bodySm" tone="subdued">{label}</Text>
      <input type="color" name={name} defaultValue={defaultValue} style={{ ...inputStyle, height: 36, padding: 2 }} />
    </Box>
  );
}

function NativeSelect({
  label,
  name,
  defaultValue,
  options,
}: {
  label: string;
  name: string;
  defaultValue: string;
  options: [string, string][];
}) {
  return (
    <Box>
      <Text as="span" variant="bodySm" tone="subdued">{label}</Text>
      <select name={name} defaultValue={defaultValue} style={inputStyle}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
    </Box>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid var(--p-color-border)',
  background: 'var(--p-color-bg-surface)',
  color: 'var(--p-color-text)',
};

function safeTargeting(raw: string): { pageScope: string; device: string } {
  try {
    const t = JSON.parse(raw || '{}');
    return { pageScope: t.pageScope ?? 'all', device: t.device ?? 'all' };
  } catch {
    return { pageScope: 'all', device: 'all' };
  }
}

function styleLabel(s: string): string {
  return s === 'launch' ? 'Launch' : s === 'evergreen' ? 'Evergreen' : 'Sale';
}
function expireLabel(a: string): string {
  return a === 'keep' ? 'Hold at zero' : a === 'message' ? 'Show message' : 'Hide';
}
function pageLabel(p: string): string {
  return ({ all: 'All', home: 'Home', products: 'Products', collections: 'Collections', cart: 'Cart' } as Record<string, string>)[p] ?? 'All';
}
function deviceLabel(d: string): string {
  return ({ all: 'All', desktop: 'Desktop', mobile: 'Mobile' } as Record<string, string>)[d] ?? 'All';
}
function scheduleSummary(t: TimerRow): string {
  if (t.style === 'evergreen') return `${t.evergreenMinutes} min / visitor`;
  if (t.style === 'launch') return t.startsAt ? `Launches ${fmt(t.startsAt)}` : 'No start set';
  return t.endsAt ? `Ends ${fmt(t.endsAt)}` : 'No end set';
}
function fmt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
