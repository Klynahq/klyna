import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/node';
import { Form, useActionData, useLoaderData, useNavigation } from '@remix-run/react';
import {
  BlockStack,
  Box,
  Button,
  Card,
  FormLayout,
  InlineStack,
  Layout,
  Page,
  Text,
  TextField,
} from '@shopify/polaris';
import { useState } from 'react';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';
import { getProgram } from '../rewards.server';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const program = await getProgram(session.shop);
  return {
    program: {
      active: program.active,
      programName: program.programName,
      pointsPerDollar: program.pointsPerDollar,
      pointsPerSignup: program.pointsPerSignup,
      pointsPerReview: program.pointsPerReview,
      pointsPerReferral: program.pointsPerReferral,
      redeemPoints: program.redeemPoints,
      redeemValue: program.redeemValue,
      currencyCode: program.currencyCode,
      refereeDiscountPct: program.refereeDiscountPct,
    },
  };
};

const num = (form: FormData, key: string, fallback: number): number => {
  const v = parseInt(String(form.get(key) ?? ''), 10);
  return Number.isFinite(v) && v >= 0 ? v : fallback;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const current = await getProgram(shop);
  const form = await request.formData();
  const intent = String(form.get('intent') ?? 'save');

  if (intent === 'toggle') {
    const updated = await prisma.program.update({
      where: { shop },
      data: { active: !current.active },
    });
    return json({ ok: updated.active ? 'Program activated.' : 'Program paused.' });
  }

  await prisma.program.update({
    where: { shop },
    data: {
      programName: String(form.get('programName') ?? current.programName).trim() || 'Rewards',
      pointsPerDollar: num(form, 'pointsPerDollar', current.pointsPerDollar),
      pointsPerSignup: num(form, 'pointsPerSignup', current.pointsPerSignup),
      pointsPerReview: num(form, 'pointsPerReview', current.pointsPerReview),
      pointsPerReferral: num(form, 'pointsPerReferral', current.pointsPerReferral),
      redeemPoints: Math.max(1, num(form, 'redeemPoints', current.redeemPoints)),
      redeemValue: Math.max(1, num(form, 'redeemValue', current.redeemValue)),
      currencyCode: String(form.get('currencyCode') ?? current.currencyCode).trim().toUpperCase() || 'USD',
      refereeDiscountPct: Math.min(100, num(form, 'refereeDiscountPct', current.refereeDiscountPct)),
    },
  });
  return json({ ok: 'Settings saved.' });
};

export default function Settings() {
  const { program } = useLoaderData<typeof loader>();
  const data = useActionData<typeof action>();
  const nav = useNavigation();
  const submitting = nav.state === 'submitting';
  const ok = data && 'ok' in data ? data.ok : null;
  const error = data && 'error' in data ? data.error : null;

  const [form, setForm] = useState({
    programName: program.programName,
    pointsPerDollar: String(program.pointsPerDollar),
    pointsPerSignup: String(program.pointsPerSignup),
    pointsPerReview: String(program.pointsPerReview),
    pointsPerReferral: String(program.pointsPerReferral),
    redeemPoints: String(program.redeemPoints),
    redeemValue: String(program.redeemValue),
    currencyCode: program.currencyCode,
    refereeDiscountPct: String(program.refereeDiscountPct),
  });
  const set = (k: keyof typeof form) => (v: string) => setForm((s) => ({ ...s, [k]: v }));

  const previewRate =
    Number(form.redeemPoints) > 0
      ? (Number(form.redeemValue) / Number(form.redeemPoints)).toFixed(3)
      : '—';

  return (
    <Page
      title="Settings"
      subtitle="Earning rules, redemption rate, and program status"
      backAction={{ url: '/app' }}
      primaryAction={
        <Form method="post">
          <input type="hidden" name="intent" value="toggle" />
          <Button submit tone={program.active ? 'critical' : 'success'}>
            {program.active ? 'Pause program' : 'Activate program'}
          </Button>
        </Form>
      }
    >
      <Layout>
        {(ok || error) && (
          <Layout.Section>
            <Box
              padding="300"
              background={error ? 'bg-surface-critical' : 'bg-surface-success'}
              borderRadius="200"
            >
              <Text as="p" tone={error ? 'critical' : 'success'}>{String(ok ?? error)}</Text>
            </Box>
          </Layout.Section>
        )}

        <Layout.Section>
          <Form method="post">
            <input type="hidden" name="intent" value="save" />
            <BlockStack gap="300">
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">Program</Text>
                  <FormLayout>
                    <FormLayout.Group>
                      <TextField
                        label="Program name"
                        name="programName"
                        autoComplete="off"
                        value={form.programName}
                        onChange={set('programName')}
                        helpText="Shown in the storefront widget header."
                      />
                      <TextField
                        label="Currency code"
                        name="currencyCode"
                        autoComplete="off"
                        value={form.currencyCode}
                        onChange={set('currencyCode')}
                        helpText="ISO 4217, e.g. USD, GBP, EUR."
                      />
                    </FormLayout.Group>
                  </FormLayout>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">Earning rules</Text>
                  <FormLayout>
                    <FormLayout.Group>
                      <TextField
                        label="Points per currency unit spent"
                        name="pointsPerDollar"
                        type="number"
                        autoComplete="off"
                        value={form.pointsPerDollar}
                        onChange={set('pointsPerDollar')}
                      />
                      <TextField
                        label="Signup bonus"
                        name="pointsPerSignup"
                        type="number"
                        autoComplete="off"
                        value={form.pointsPerSignup}
                        onChange={set('pointsPerSignup')}
                      />
                    </FormLayout.Group>
                    <FormLayout.Group>
                      <TextField
                        label="Points per review"
                        name="pointsPerReview"
                        type="number"
                        autoComplete="off"
                        value={form.pointsPerReview}
                        onChange={set('pointsPerReview')}
                      />
                      <TextField
                        label="Points per converted referral"
                        name="pointsPerReferral"
                        type="number"
                        autoComplete="off"
                        value={form.pointsPerReferral}
                        onChange={set('pointsPerReferral')}
                      />
                    </FormLayout.Group>
                  </FormLayout>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">Redemption</Text>
                  <FormLayout>
                    <FormLayout.Group>
                      <TextField
                        label="Points to redeem"
                        name="redeemPoints"
                        type="number"
                        autoComplete="off"
                        value={form.redeemPoints}
                        onChange={set('redeemPoints')}
                      />
                      <TextField
                        label={`Discount value (${form.currencyCode})`}
                        name="redeemValue"
                        type="number"
                        autoComplete="off"
                        value={form.redeemValue}
                        onChange={set('redeemValue')}
                      />
                      <TextField
                        label="Referred friend discount (%)"
                        name="refereeDiscountPct"
                        type="number"
                        autoComplete="off"
                        value={form.refereeDiscountPct}
                        onChange={set('refereeDiscountPct')}
                      />
                    </FormLayout.Group>
                    <Text as="p" tone="subdued" variant="bodySm">
                      Effective rate: {previewRate} {form.currencyCode} per point —{' '}
                      {form.redeemPoints} pts → {form.currencyCode} {form.redeemValue} off.
                    </Text>
                  </FormLayout>
                </BlockStack>
              </Card>

              <InlineStack align="end">
                <Button submit variant="primary" loading={submitting}>Save settings</Button>
              </InlineStack>
            </BlockStack>
          </Form>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="200">
              <Text as="h3" variant="headingSm">Storefront widget</Text>
              <Text as="p" tone="subdued" variant="bodySm">
                Add the “Klyna Rewards” block to any theme section from the theme
                editor (Online Store → Customize → Add block → Apps). It reads these
                settings live, so changes here update the widget instantly.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
