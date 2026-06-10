import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/node';
import { Form, useActionData, useLoaderData, useNavigation } from '@remix-run/react';
import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  InlineStack,
  Layout,
  List,
  Page,
  Text,
} from '@shopify/polaris';
import { auditPage, type AuditResult } from '@klyna/core';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const recent = await prisma.auditResult.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  return { shop: session.shop, recent };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const url = String(form.get('url') ?? `https://${session.shop}`);

  let html: string;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'KlynaBot/0.1 (+https://klyna.dev)' },
    });
    if (!res.ok) {
      return json({ error: `Fetch failed: HTTP ${res.status}` }, { status: 400 });
    }
    html = await res.text();
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : 'Fetch failed' },
      { status: 500 },
    );
  }

  const result = auditPage({
    url,
    html,
    fetchedAt: new Date().toISOString(),
  });

  await prisma.auditResult.create({
    data: {
      shop: session.shop,
      url,
      score: result.score,
      grade: result.grade,
      findings: JSON.stringify(result.findings),
    },
  });

  return json({ result });
};

export default function Audit() {
  const { shop, recent } = useLoaderData<typeof loader>();
  const data = useActionData<typeof action>();
  const nav = useNavigation();
  const submitting = nav.state === 'submitting';
  const result = data && 'result' in data ? (data.result as AuditResult) : null;
  const error = data && 'error' in data ? data.error : null;
  const defaultUrl = `https://${shop}`;

  const gradeTone = (g: string) =>
    g === 'A' || g === 'B' ? 'success' : g === 'C' || g === 'D' ? 'warning' : 'critical';

  return (
    <Page title="Audit store" backAction={{ url: '/app' }}>
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Run an audit</Text>
              <Text as="p" tone="subdued">
                Klyna fetches the page and runs a full SEO + GEO audit locally —
                schema, meta, headings, internal links, FAQ structure, citation readiness.
              </Text>
              <Form method="post">
                <BlockStack gap="200">
                  <input
                    type="url"
                    name="url"
                    defaultValue={defaultUrl}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: 8,
                      border: '1px solid var(--p-color-border)',
                    }}
                  />
                  <Button submit loading={submitting} variant="primary">
                    Audit page
                  </Button>
                </BlockStack>
              </Form>
              {error && (
                <Text as="p" tone="critical">{String(error)}</Text>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        {result && (
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">Result</Text>
                  <InlineStack gap="200" blockAlign="center">
                    <Badge tone={gradeTone(result.grade)}>{`Grade ${result.grade}`}</Badge>
                    <Text as="p" variant="headingLg" fontWeight="bold">
                      {String(result.score)}
                    </Text>
                  </InlineStack>
                </InlineStack>
                <Box paddingBlockStart="200">
                  <BlockStack gap="100">
                    <Text as="p" variant="bodySm" tone="subdued">URL</Text>
                    <Text as="p" variant="bodyMd">{result.url}</Text>
                  </BlockStack>
                </Box>

                <BlockStack gap="200">
                  <Text as="h3" variant="headingSm">Findings · {result.findings.length}</Text>
                  <List type="bullet">
                    {result.findings.map((f) => (
                      <List.Item key={f.id}>
                        <Text as="span" tone={
                          f.severity === 'error'
                            ? 'critical'
                            : f.severity === 'warn'
                              ? 'caution'
                              : 'subdued'
                        }>
                          [{f.severity.toUpperCase()}]
                        </Text>{' '}{f.message}
                        {f.fix && (
                          <>
                            <br />
                            <Text as="span" variant="bodySm" tone="subdued">→ {f.fix}</Text>
                          </>
                        )}
                      </List.Item>
                    ))}
                  </List>
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        )}

        {recent.length > 0 && (
          <Layout.Section>
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">Recent audits</Text>
                <List type="bullet">
                  {recent.map((r) => (
                    <List.Item key={r.id}>
                      <Badge tone={gradeTone(r.grade)}>{`${r.grade} · ${r.score}`}</Badge>{' '}
                      {r.url}
                      <Text as="span" tone="subdued">
                        {' '} · {new Date(r.createdAt).toLocaleString()}
                      </Text>
                    </List.Item>
                  ))}
                </List>
              </BlockStack>
            </Card>
          </Layout.Section>
        )}
      </Layout>
    </Page>
  );
}
