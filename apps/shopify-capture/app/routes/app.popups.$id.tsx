import { useState } from 'react';
import { type ActionFunctionArgs, type LoaderFunctionArgs, json, redirect } from '@remix-run/node';
import { useActionData, useLoaderData, useNavigation, useSubmit } from '@remix-run/react';
import {
  Badge,
  BlockStack,
  Banner,
  Box,
  Button,
  Card,
  Divider,
  InlineGrid,
  InlineStack,
  Layout,
  Page,
  RangeSlider,
  Select,
  Text,
  TextField,
} from '@shopify/polaris';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';
import {
  DEFAULT_WHEEL,
  FORMAT_LABELS,
  TRIGGER_LABELS,
  collectsEmail,
  collectsPhone,
  parseWheel,
  type PopupFormat,
  type WheelSegment,
} from '../lib/popups';

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const popup = await prisma.popup.findFirst({
    where: { id: params.id, shop: session.shop },
  });
  if (!popup) throw new Response('Not found', { status: 404 });
  return { popup };
};

export const action = async ({ params, request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const existing = await prisma.popup.findFirst({ where: { id: params.id, shop } });
  if (!existing) throw new Response('Not found', { status: 404 });

  const form = await request.formData();
  const intent = String(form.get('intent') ?? 'save');

  if (intent === 'delete') {
    await prisma.popup.delete({ where: { id: existing.id } });
    return redirect('/app/popups');
  }

  if (intent === 'toggle') {
    const next = existing.status === 'active' ? 'paused' : 'active';
    await prisma.popup.update({ where: { id: existing.id }, data: { status: next } });
    return json({ ok: true, status: next });
  }

  const num = (key: string, fallback: number) => {
    const v = Number(form.get(key));
    return Number.isFinite(v) ? v : fallback;
  };

  // Build the wheel from the posted segment rows when format is spin_to_win.
  let wheelSegments = existing.wheelSegments;
  if (String(form.get('format')) === 'spin_to_win') {
    const labels = form.getAll('wheel_label').map(String);
    const codes = form.getAll('wheel_code').map(String);
    const weights = form.getAll('wheel_weight').map(Number);
    const colors = form.getAll('wheel_color').map(String);
    const segments: WheelSegment[] = labels
      .map((label, i) => ({
        label: label.trim(),
        discountCode: (codes[i] ?? '').trim(),
        weight: Number.isFinite(weights[i]) ? Math.max(0, weights[i]) : 1,
        color: colors[i] ?? '#7c5cff',
      }))
      .filter((s) => s.label.length > 0);
    wheelSegments = JSON.stringify(segments.length > 0 ? segments : DEFAULT_WHEEL);
  }

  await prisma.popup.update({
    where: { id: existing.id },
    data: {
      name: String(form.get('name') ?? existing.name).slice(0, 120) || 'Untitled popup',
      format: String(form.get('format') ?? existing.format),
      headline: String(form.get('headline') ?? existing.headline).slice(0, 160),
      body: String(form.get('body') ?? existing.body).slice(0, 500),
      buttonLabel: String(form.get('buttonLabel') ?? existing.buttonLabel).slice(0, 60),
      successMessage: String(form.get('successMessage') ?? existing.successMessage).slice(0, 200),
      accentColor: String(form.get('accentColor') ?? existing.accentColor),
      discountCode: String(form.get('discountCode') ?? '').trim() || null,
      trigger: String(form.get('trigger') ?? existing.trigger),
      triggerSeconds: Math.min(120, Math.max(0, num('triggerSeconds', existing.triggerSeconds))),
      triggerScroll: Math.min(100, Math.max(0, num('triggerScroll', existing.triggerScroll))),
      targetPages: String(form.get('targetPages') ?? existing.targetPages),
      targetDevice: String(form.get('targetDevice') ?? existing.targetDevice),
      targetAudience: String(form.get('targetAudience') ?? existing.targetAudience),
      frequencyDays: Math.min(90, Math.max(0, num('frequencyDays', existing.frequencyDays))),
      wheelSegments,
    },
  });

  return json({ ok: true, saved: true });
};

export default function PopupEditor() {
  const { popup } = useLoaderData<typeof loader>();
  const data = useActionData<typeof action>();
  const submit = useSubmit();
  const nav = useNavigation();
  const busy = nav.state !== 'idle';

  const [format, setFormat] = useState<string>(popup.format);
  const [trigger, setTrigger] = useState<string>(popup.trigger);
  const [targetPages, setTargetPages] = useState<string>(popup.targetPages);
  const [headline, setHeadline] = useState(popup.headline);
  const [accent, setAccent] = useState(popup.accentColor);
  const [buttonLabel, setButtonLabel] = useState(popup.buttonLabel);
  const [triggerSeconds, setTriggerSeconds] = useState(popup.triggerSeconds);
  const [triggerScroll, setTriggerScroll] = useState(popup.triggerScroll);
  const [name, setName] = useState(popup.name);
  const [body, setBody] = useState(popup.body);
  const [successMessage, setSuccessMessage] = useState(popup.successMessage);
  const [discountCode, setDiscountCode] = useState(popup.discountCode ?? '');
  const [targetDevice, setTargetDevice] = useState(popup.targetDevice);
  const [targetAudience, setTargetAudience] = useState(popup.targetAudience);
  const [frequencyDays, setFrequencyDays] = useState(String(popup.frequencyDays));
  const [wheel, setWheel] = useState<WheelSegment[]>(() => {
    const parsed = parseWheel(popup.wheelSegments);
    return parsed.length > 0 ? parsed : DEFAULT_WHEEL;
  });

  const isSpin = format === 'spin_to_win';
  const status = (data && 'status' in data && data.status) || popup.status;

  const updateWheel = (i: number, patch: Partial<WheelSegment>) =>
    setWheel((w) => w.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const addSegment = () =>
    setWheel((w) => [...w, { label: 'New prize', discountCode: '', weight: 10, color: '#7c5cff' }]);
  const removeSegment = (i: number) => setWheel((w) => w.filter((_, idx) => idx !== i));

  const toggle = () => submit({ intent: 'toggle' }, { method: 'post' });
  const remove = () => submit({ intent: 'delete' }, { method: 'post' });

  return (
    <Page
      title={popup.name || 'Untitled popup'}
      titleMetadata={
        <Badge tone={status === 'active' ? 'success' : status === 'paused' ? 'attention' : 'new'}>
          {status}
        </Badge>
      }
      backAction={{ url: '/app/popups' }}
      secondaryActions={[
        {
          content: status === 'active' ? 'Pause' : 'Activate',
          onAction: toggle,
        },
        { content: 'Delete', destructive: true, onAction: remove },
      ]}
    >
      {data && 'saved' in data && data.saved && (
        <Box paddingBlockEnd="300">
          <Banner tone="success" title="Saved" />
        </Box>
      )}

      <form
        method="post"
        onSubmit={(e) => {
          e.preventDefault();
          submit(e.currentTarget, { method: 'post' });
        }}
      >
        <input type="hidden" name="intent" value="save" />
        <Layout>
          <Layout.Section>
            <BlockStack gap="400">
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">Campaign</Text>
                  <TextField
                    label="Name"
                    name="name"
                    autoComplete="off"
                    value={name}
                    onChange={setName}
                  />
                  <Select
                    label="Format"
                    name="format"
                    options={(Object.keys(FORMAT_LABELS) as PopupFormat[]).map((f) => ({
                      label: FORMAT_LABELS[f],
                      value: f,
                    }))}
                    value={format}
                    onChange={setFormat}
                  />
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">Content</Text>
                  <TextField
                    label="Headline"
                    name="headline"
                    autoComplete="off"
                    value={headline}
                    onChange={setHeadline}
                  />
                  <TextField
                    label="Body"
                    name="body"
                    autoComplete="off"
                    multiline={3}
                    value={body}
                    onChange={setBody}
                  />
                  <InlineGrid columns={{ xs: 1, sm: 2 }} gap="300">
                    <TextField
                      label="Button label"
                      name="buttonLabel"
                      autoComplete="off"
                      value={buttonLabel}
                      onChange={setButtonLabel}
                    />
                    <TextField
                      label="Accent color"
                      name="accentColor"
                      autoComplete="off"
                      value={accent}
                      onChange={setAccent}
                      helpText="Hex, e.g. #7c5cff"
                    />
                  </InlineGrid>
                  <TextField
                    label="Success message"
                    name="successMessage"
                    autoComplete="off"
                    value={successMessage}
                    onChange={setSuccessMessage}
                  />
                  {!isSpin && (
                    <TextField
                      label="Discount code (revealed on signup)"
                      name="discountCode"
                      autoComplete="off"
                      value={discountCode}
                      onChange={setDiscountCode}
                      helpText="Optional. Create the code in Shopify Discounts first."
                    />
                  )}
                </BlockStack>
              </Card>

              {isSpin && (
                <Card>
                  <BlockStack gap="300">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text as="h2" variant="headingMd">Wheel segments</Text>
                      <Button variant="plain" onClick={addSegment}>Add segment</Button>
                    </InlineStack>
                    <Text as="p" tone="subdued" variant="bodySm">
                      Each spin lands on a segment weighted by its odds. Leave the
                      code empty for a "no win" segment.
                    </Text>
                    {wheel.map((seg, i) => (
                      <Box key={i} padding="300" background="bg-surface-secondary" borderRadius="200">
                        <InlineGrid columns={{ xs: 1, sm: 4 }} gap="200">
                          <TextField
                            label="Label"
                            labelHidden={i > 0}
                            name="wheel_label"
                            autoComplete="off"
                            value={seg.label}
                            onChange={(v) => updateWheel(i, { label: v })}
                          />
                          <TextField
                            label="Code"
                            labelHidden={i > 0}
                            name="wheel_code"
                            autoComplete="off"
                            value={seg.discountCode}
                            onChange={(v) => updateWheel(i, { discountCode: v })}
                          />
                          <TextField
                            label="Weight"
                            labelHidden={i > 0}
                            type="number"
                            name="wheel_weight"
                            autoComplete="off"
                            value={String(seg.weight)}
                            onChange={(v) => updateWheel(i, { weight: Number(v) || 0 })}
                          />
                          <TextField
                            label="Color"
                            labelHidden={i > 0}
                            name="wheel_color"
                            autoComplete="off"
                            value={seg.color}
                            onChange={(v) => updateWheel(i, { color: v })}
                            connectedRight={
                              <Button tone="critical" variant="plain" onClick={() => removeSegment(i)}>
                                Remove
                              </Button>
                            }
                          />
                        </InlineGrid>
                      </Box>
                    ))}
                  </BlockStack>
                </Card>
              )}

              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">Trigger</Text>
                  <Select
                    label="Show the popup"
                    name="trigger"
                    options={(Object.keys(TRIGGER_LABELS) as Array<keyof typeof TRIGGER_LABELS>).map((t) => ({
                      label: TRIGGER_LABELS[t],
                      value: t,
                    }))}
                    value={trigger}
                    onChange={setTrigger}
                  />
                  {trigger === 'time' && (
                    <RangeSlider
                      label={`After ${triggerSeconds}s on page`}
                      min={0}
                      max={60}
                      value={triggerSeconds}
                      onChange={(v) => setTriggerSeconds(Array.isArray(v) ? v[0] : v)}
                      output
                    />
                  )}
                  {trigger === 'scroll' && (
                    <RangeSlider
                      label={`After scrolling ${triggerScroll}% of the page`}
                      min={0}
                      max={100}
                      value={triggerScroll}
                      onChange={(v) => setTriggerScroll(Array.isArray(v) ? v[0] : v)}
                      output
                    />
                  )}
                  {trigger === 'exit_intent' && (
                    <Text as="p" tone="subdued" variant="bodySm">
                      Fires when the cursor leaves the viewport toward the browser
                      chrome (desktop) or on a fast upward scroll (mobile).
                    </Text>
                  )}
                  <input type="hidden" name="triggerSeconds" value={triggerSeconds} />
                  <input type="hidden" name="triggerScroll" value={triggerScroll} />
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">Targeting</Text>
                  <InlineGrid columns={{ xs: 1, sm: 2 }} gap="300">
                    <Select
                      label="Pages"
                      name="targetPages"
                      options={[
                        { label: 'All pages', value: 'all' },
                        { label: 'Home only', value: 'home' },
                        { label: 'Product pages', value: 'product' },
                        { label: 'Collection pages', value: 'collection' },
                        { label: 'Cart', value: 'cart' },
                      ]}
                      value={targetPages}
                      onChange={setTargetPages}
                    />
                    <BlockStack gap="300">
                      <Select
                        label="Device"
                        name="targetDevice"
                        options={[
                          { label: 'All devices', value: 'all' },
                          { label: 'Desktop only', value: 'desktop' },
                          { label: 'Mobile only', value: 'mobile' },
                        ]}
                        value={targetDevice}
                        onChange={setTargetDevice}
                      />
                      <Select
                        label="Audience"
                        name="targetAudience"
                        options={[
                          { label: 'Everyone', value: 'all' },
                          { label: 'New visitors', value: 'new' },
                          { label: 'Returning visitors', value: 'returning' },
                        ]}
                        value={targetAudience}
                        onChange={setTargetAudience}
                      />
                      <TextField
                        label="Re-show cooldown (days)"
                        name="frequencyDays"
                        type="number"
                        autoComplete="off"
                        value={frequencyDays}
                        onChange={setFrequencyDays}
                        helpText="Don't show again to the same visitor for this many days."
                      />
                    </BlockStack>
                  </InlineGrid>
                </BlockStack>
              </Card>

              <InlineStack align="end">
                <Button variant="primary" submit loading={busy}>
                  Save changes
                </Button>
              </InlineStack>
            </BlockStack>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Live preview</Text>
                <PopupPreview
                  headline={headline}
                  accent={accent}
                  buttonLabel={buttonLabel}
                  format={format}
                  wheel={wheel}
                  collectsEmail={collectsEmail(format)}
                  collectsPhone={collectsPhone(format)}
                />
                <Divider />
                <Text as="p" tone="subdued" variant="bodySm">
                  Renders client-side on the storefront via the Klyna Capture app
                  embed. Enable it under Theme → Customize → App embeds.
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </form>
    </Page>
  );
}

function PopupPreview({
  headline,
  accent,
  buttonLabel,
  format,
  wheel,
  collectsEmail: showEmail,
  collectsPhone: showPhone,
}: {
  headline: string;
  accent: string;
  buttonLabel: string;
  format: string;
  wheel: WheelSegment[];
  collectsEmail: boolean;
  collectsPhone: boolean;
}) {
  const isSpin = format === 'spin_to_win';
  return (
    <div
      style={{
        borderRadius: 12,
        border: '1px solid var(--p-color-border)',
        overflow: 'hidden',
        background: '#0b0b0f',
        color: '#f4f4f5',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      <div style={{ padding: 20, display: 'grid', gap: 12, justifyItems: 'center', textAlign: 'center' }}>
        {isSpin && (
          <div
            aria-hidden
            style={{
              width: 120,
              height: 120,
              borderRadius: '50%',
              background: `conic-gradient(${wheelGradient(wheel)})`,
              border: '4px solid #1a1a23',
            }}
          />
        )}
        <strong style={{ fontSize: 18, lineHeight: 1.25 }}>{headline || 'Your headline'}</strong>
        {showEmail && (
          <input
            disabled
            placeholder="you@email.com"
            style={{
              width: '100%',
              padding: '9px 12px',
              borderRadius: 8,
              border: '1px solid #2a2a35',
              background: '#13131a',
              color: '#a1a1aa',
            }}
          />
        )}
        {showPhone && (
          <input
            disabled
            placeholder="+1 555 000 0000"
            style={{
              width: '100%',
              padding: '9px 12px',
              borderRadius: 8,
              border: '1px solid #2a2a35',
              background: '#13131a',
              color: '#a1a1aa',
            }}
          />
        )}
        <button
          type="button"
          disabled
          style={{
            width: '100%',
            padding: '10px 14px',
            borderRadius: 8,
            border: 'none',
            background: accent || '#7c5cff',
            color: '#fff',
            fontWeight: 600,
            cursor: 'default',
          }}
        >
          {isSpin ? 'Spin to win' : buttonLabel || 'Subscribe'}
        </button>
      </div>
    </div>
  );
}

function wheelGradient(wheel: WheelSegment[]): string {
  const total = wheel.reduce((sum, s) => sum + Math.max(0, s.weight), 0) || 1;
  let acc = 0;
  const stops: string[] = [];
  for (const seg of wheel) {
    const start = (acc / total) * 360;
    acc += Math.max(0, seg.weight);
    const end = (acc / total) * 360;
    stops.push(`${seg.color} ${start}deg ${end}deg`);
  }
  return stops.join(', ');
}
