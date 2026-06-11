import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/node';
import { Form, useActionData, useLoaderData, useNavigation } from '@remix-run/react';
import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  FormLayout,
  InlineGrid,
  InlineStack,
  Layout,
  Page,
  Text,
  TextField,
} from '@shopify/polaris';
import { useState } from 'react';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';
import { getProgram, resolveTier } from '../rewards.server';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const program = await getProgram(shop);

  // Count members currently sitting in each tier (by lifetime points).
  const members = await prisma.member.findMany({
    where: { shop },
    select: { lifetime: true },
  });
  const counts: Record<string, number> = {};
  for (const m of members) {
    const tier = resolveTier(program.tiers, m.lifetime);
    if (tier) counts[tier.id] = (counts[tier.id] ?? 0) + 1;
  }

  return {
    shop,
    tiers: program.tiers.map((t) => ({
      id: t.id,
      name: t.name,
      threshold: t.threshold,
      multiplier: t.multiplier,
      perkText: t.perkText,
      color: t.color,
      members: counts[t.id] ?? 0,
    })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  await getProgram(shop);
  const form = await request.formData();
  const intent = String(form.get('intent') ?? '');

  if (intent === 'create') {
    const name = String(form.get('name') ?? '').trim();
    const threshold = parseInt(String(form.get('threshold') ?? '0'), 10);
    const multiplier = parseFloat(String(form.get('multiplier') ?? '1'));
    const perkText = String(form.get('perkText') ?? '').trim();
    const color = String(form.get('color') ?? '#7c5cff').trim();
    if (!name) return json({ error: 'Tier name is required.' }, { status: 400 });
    if (!Number.isFinite(threshold) || threshold < 0) {
      return json({ error: 'Threshold must be zero or more.' }, { status: 400 });
    }
    await prisma.tier.create({
      data: {
        shop,
        name,
        threshold,
        multiplier: Number.isFinite(multiplier) ? multiplier : 1,
        perkText,
        color,
      },
    });
    return json({ ok: `Tier “${name}” created.` });
  }

  if (intent === 'update') {
    const id = String(form.get('id') ?? '');
    const threshold = parseInt(String(form.get('threshold') ?? '0'), 10);
    const multiplier = parseFloat(String(form.get('multiplier') ?? '1'));
    const perkText = String(form.get('perkText') ?? '').trim();
    await prisma.tier.update({
      where: { id },
      data: {
        threshold: Number.isFinite(threshold) ? threshold : 0,
        multiplier: Number.isFinite(multiplier) ? multiplier : 1,
        perkText,
      },
    });
    return json({ ok: 'Tier updated.' });
  }

  if (intent === 'delete') {
    const id = String(form.get('id') ?? '');
    await prisma.tier.delete({ where: { id } });
    return json({ ok: 'Tier removed.' });
  }

  return json({ error: 'Unknown action.' }, { status: 400 });
};

export default function Tiers() {
  const { tiers } = useLoaderData<typeof loader>();
  const data = useActionData<typeof action>();
  const nav = useNavigation();
  const submitting = nav.state === 'submitting';
  const ok = data && 'ok' in data ? data.ok : null;
  const error = data && 'error' in data ? data.error : null;

  const [name, setName] = useState('');
  const [threshold, setThreshold] = useState('');
  const [multiplier, setMultiplier] = useState('1');
  const [perk, setPerk] = useState('');

  return (
    <Page title="Tiers" subtitle="Reward loyalty with escalating perks" backAction={{ url: '/app' }}>
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
          <InlineGrid columns={{ xs: 1, md: 3 }} gap="300">
            {tiers.map((t) => (
              <Card key={t.id}>
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <InlineStack gap="200" blockAlign="center">
                      <span
                        style={{
                          width: 12,
                          height: 12,
                          borderRadius: 4,
                          background: t.color,
                          display: 'inline-block',
                        }}
                      />
                      <Text as="h3" variant="headingMd">{t.name}</Text>
                    </InlineStack>
                    <Badge>{`${t.members} member${t.members === 1 ? '' : 's'}`}</Badge>
                  </InlineStack>

                  <Form method="post">
                    <input type="hidden" name="intent" value="update" />
                    <input type="hidden" name="id" value={t.id} />
                    <FormLayout>
                      <FormLayout.Group condensed>
                        <TextField
                          label="Threshold (lifetime pts)"
                          name="threshold"
                          type="number"
                          autoComplete="off"
                          defaultValue={String(t.threshold)}
                        />
                        <TextField
                          label="Earn multiplier"
                          name="multiplier"
                          type="number"
                          step={0.05}
                          autoComplete="off"
                          defaultValue={String(t.multiplier)}
                        />
                      </FormLayout.Group>
                      <TextField
                        label="Perk"
                        name="perkText"
                        autoComplete="off"
                        defaultValue={t.perkText}
                        multiline={2}
                      />
                      <InlineStack gap="200">
                        <Button submit size="slim" loading={submitting}>Save</Button>
                      </InlineStack>
                    </FormLayout>
                  </Form>

                  <Form method="post">
                    <input type="hidden" name="intent" value="delete" />
                    <input type="hidden" name="id" value={t.id} />
                    <Button submit size="slim" tone="critical" variant="tertiary">
                      Remove tier
                    </Button>
                  </Form>
                </BlockStack>
              </Card>
            ))}
          </InlineGrid>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Add a tier</Text>
              <Form method="post">
                <input type="hidden" name="intent" value="create" />
                <FormLayout>
                  <FormLayout.Group>
                    <TextField
                      label="Name"
                      name="name"
                      autoComplete="off"
                      value={name}
                      onChange={setName}
                      placeholder="Platinum"
                    />
                    <TextField
                      label="Threshold (lifetime pts)"
                      name="threshold"
                      type="number"
                      autoComplete="off"
                      value={threshold}
                      onChange={setThreshold}
                      placeholder="10000"
                    />
                    <TextField
                      label="Earn multiplier"
                      name="multiplier"
                      type="number"
                      step={0.05}
                      autoComplete="off"
                      value={multiplier}
                      onChange={setMultiplier}
                    />
                  </FormLayout.Group>
                  <TextField
                    label="Perk"
                    name="perkText"
                    autoComplete="off"
                    value={perk}
                    onChange={setPerk}
                    placeholder="2× points + priority support"
                  />
                  <input type="hidden" name="color" value="#7c5cff" />
                  <Button submit variant="primary" loading={submitting}>Add tier</Button>
                </FormLayout>
              </Form>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
