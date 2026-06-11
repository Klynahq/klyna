import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/node';
import { useActionData, useLoaderData, useNavigation, useSubmit } from '@remix-run/react';
import { useState } from 'react';
import {
  Banner,
  BlockStack,
  Button,
  Card,
  Checkbox,
  FormLayout,
  Layout,
  Page,
  Select,
  Text,
  TextField,
} from '@shopify/polaris';
import { authenticate } from '../shopify.server';
import { getShopSettings } from '../services/waitlist.server';
import prisma from '../db.server';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const settings = await getShopSettings(session.shop);
  return { settings };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();

  const buttonLabel = String(form.get('buttonLabel') ?? '').trim() || 'Notify me when available';
  const successMessage =
    String(form.get('successMessage') ?? '').trim() ||
    "You're on the list — we'll email you the moment it's back.";
  const collectPhone = form.get('collectPhone') === 'true';
  const requireConsent = form.get('requireConsent') === 'true';
  const alertsEnabled = form.get('alertsEnabled') === 'true';
  const resendGuardHours = clampInt(Number(form.get('resendGuardHours')), 0, 720, 24);

  await prisma.shopSettings.upsert({
    where: { shop },
    update: { buttonLabel, successMessage, collectPhone, requireConsent, alertsEnabled, resendGuardHours },
    create: { shop, buttonLabel, successMessage, collectPhone, requireConsent, alertsEnabled, resendGuardHours },
  });

  return json({ ok: true });
};

function clampInt(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export default function Settings() {
  const { settings } = useLoaderData<typeof loader>();
  const data = useActionData<typeof action>();
  const nav = useNavigation();
  const submit = useSubmit();
  const saving = nav.state === 'submitting';

  const [buttonLabel, setButtonLabel] = useState(settings.buttonLabel);
  const [successMessage, setSuccessMessage] = useState(settings.successMessage);
  const [collectPhone, setCollectPhone] = useState(settings.collectPhone);
  const [requireConsent, setRequireConsent] = useState(settings.requireConsent);
  const [alertsEnabled, setAlertsEnabled] = useState(settings.alertsEnabled);
  const [resendGuardHours, setResendGuardHours] = useState(String(settings.resendGuardHours));

  const handleSave = () => {
    const fd = new FormData();
    fd.set('buttonLabel', buttonLabel);
    fd.set('successMessage', successMessage);
    fd.set('collectPhone', String(collectPhone));
    fd.set('requireConsent', String(requireConsent));
    fd.set('alertsEnabled', String(alertsEnabled));
    fd.set('resendGuardHours', resendGuardHours);
    submit(fd, { method: 'post' });
  };

  return (
    <Page
      title="Settings"
      subtitle="Tune the storefront widget and how alerts are delivered."
      backAction={{ url: '/app' }}
      primaryAction={{ content: 'Save', onAction: handleSave, loading: saving }}
    >
      <Layout>
        {data?.ok && (
          <Layout.Section>
            <Banner tone="success" title="Settings saved" />
          </Layout.Section>
        )}

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Storefront widget</Text>
              <FormLayout>
                <TextField
                  label="Button label"
                  value={buttonLabel}
                  onChange={setButtonLabel}
                  autoComplete="off"
                  helpText="Shown on sold-out variants in your theme."
                />
                <TextField
                  label="Success message"
                  value={successMessage}
                  onChange={setSuccessMessage}
                  autoComplete="off"
                  multiline={2}
                  helpText="Confirmation shown after a shopper signs up."
                />
                <Checkbox
                  label="Collect phone number for SMS alerts"
                  checked={collectPhone}
                  onChange={setCollectPhone}
                  helpText="Adds a phone field alongside email. Requires Twilio credentials to deliver."
                />
                <Checkbox
                  label="Require explicit marketing consent"
                  checked={requireConsent}
                  onChange={setRequireConsent}
                  helpText="Adds a consent checkbox the shopper must tick before subscribing."
                />
              </FormLayout>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Delivery</Text>
              <FormLayout>
                <Select
                  label="Alerts"
                  options={[
                    { label: 'Enabled — send alerts on restock', value: 'true' },
                    { label: 'Paused — capture signups but don’t send', value: 'false' },
                  ]}
                  value={String(alertsEnabled)}
                  onChange={(v) => setAlertsEnabled(v === 'true')}
                />
                <TextField
                  label="Resend guard (hours)"
                  type="number"
                  value={resendGuardHours}
                  onChange={setResendGuardHours}
                  autoComplete="off"
                  min={0}
                  max={720}
                  helpText="Don't re-alert the same contact about the same variant within this window. Guards against a flapping inventory feed."
                />
              </FormLayout>
              <Text as="p" variant="bodySm" tone="subdued">
                Email is delivered via Resend and SMS via Twilio when their API keys
                are set in the environment. Without keys, Klyna runs in “log only”
                mode — every alert is still recorded so the pipeline behaves
                identically in development.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
