import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/node';
import { Form, useActionData, useFetcher, useLoaderData, useNavigation } from '@remix-run/react';
import {
  Badge,
  Banner,
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
import { PROMPTS } from '~/lib/klyna-ai-client';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';
import {
  applyCollectionFix,
  applyHomeFix,
  applyPageFix,
  applyProductFix,
  classifyFindings,
  detectResource,
} from '../lib/seo-fix';
import { getAiClientForShop, getShopAiSettings } from '../lib/ai.server';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const [recent, ai] = await Promise.all([
    prisma.auditResult.findMany({
      where: { shop: session.shop },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    getShopAiSettings(session.shop),
  ]);
  return { shop: session.shop, recent, aiEnabled: ai.provider !== 'off' && !!ai.apiKey };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get('intent') ?? 'audit');
  const url = String(form.get('url') ?? `https://${session.shop}`);

  // ── AI suggest path — content suggestion for a manual finding ──
  if (intent === 'ai-suggest') {
    const findingId = String(form.get('findingId') ?? '');
    const ai = await getAiClientForShop(session.shop);
    if (ai.provider === 'off') {
      return json({
        aiSuggestion: { findingId, text: '', error: 'AI is off. Enable a provider in Settings → AI assistant.' },
      });
    }

    // Pull the page to give the model real context
    let html = '';
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'KlynaBot/0.1 (+https://klyna.dev)' },
      });
      html = await res.text();
    } catch {
      // Continue with empty context; the prompt still works with title alone.
    }
    const pageTitle = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? session.shop;
    const bodyText = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 1500);

    let prompt = '';
    const fid = findingId.toLowerCase();
    if (fid.includes('h1')) {
      prompt = PROMPTS.h1Suggestion(pageTitle, bodyText);
    } else if (fid.includes('word') || fid.includes('thin')) {
      prompt = PROMPTS.expandThinContent(pageTitle, bodyText);
    } else if (fid.includes('faq') || fid.includes('comparison') || fid.includes('listicle')) {
      prompt = PROMPTS.faqSet(pageTitle, bodyText);
    } else {
      // Fallback: generic SEO description for the URL
      prompt = PROMPTS.metaDescription('page', session.shop, bodyText);
    }

    const out = await ai.complete({ prompt, maxTokens: 500, cacheKey: `${session.shop}|${url}|${findingId}` });
    return json({
      aiSuggestion: { findingId, text: out.text, error: out.error, source: out.source },
    });
  }

  // ── AUTO-FIX path ──
  if (intent === 'fix') {
    const { kind, handle } = detectResource(url, session.shop);
    const client = async (q: string, opts?: { variables?: Record<string, unknown> }) =>
      admin.graphql(q, opts);

    try {
      let applied: string[] = [];
      let resourceTitle: string | undefined;

      if (kind === 'home') {
        // Look up shop GID + name
        const shopRes = await admin.graphql(/* GraphQL */ `{ shop { id name } }`);
        const shopJson = (await shopRes.json()) as { data: { shop: { id: string; name: string } } };
        const { id: shopGid, name: shopName } = shopJson.data.shop;
        resourceTitle = shopName;
        applied = await applyHomeFix(client, shopGid, shopName);
      } else if (kind === 'product' && handle) {
        applied = await applyProductFix(client, handle);
      } else if (kind === 'collection' && handle) {
        applied = await applyCollectionFix(client, handle);
      } else if (kind === 'page' && handle) {
        applied = await applyPageFix(client, handle);
      } else {
        return json({ fixError: `Cannot auto-fix this URL (${kind}).` }, { status: 400 });
      }

      // Re-audit to show new score
      const fetched = await fetch(url, {
        headers: { 'User-Agent': 'KlynaBot/0.1 (+https://klyna.dev)' },
      });
      const html = await fetched.text();
      const result = auditPage({ url, html, fetchedAt: new Date().toISOString() });
      await prisma.auditResult.create({
        data: {
          shop: session.shop,
          url,
          score: result.score,
          grade: result.grade,
          findings: JSON.stringify(result.findings),
        },
      });

      return json({ result, applied, resourceKind: kind, resourceTitle });
    } catch (err) {
      return json(
        { fixError: err instanceof Error ? err.message : 'Auto-fix failed' },
        { status: 500 },
      );
    }
  }

  // ── AUDIT path (default) ──
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

function AiSuggestRow({ id, message, reason, url }: { id: string; message: string; reason: string; url: string }) {
  const fetcher = useFetcher<{ aiSuggestion?: { findingId: string; text: string; error?: string; source?: string } }>();
  const busy = fetcher.state === 'submitting' && fetcher.formData?.get('findingId') === id;
  const result = fetcher.data?.aiSuggestion?.findingId === id ? fetcher.data.aiSuggestion : null;

  const run = () => {
    const fd = new FormData();
    fd.set('intent', 'ai-suggest');
    fd.set('findingId', id);
    fd.set('url', url);
    fetcher.submit(fd, { method: 'post' });
  };

  return (
    <List.Item>
      <Text as="span" variant="bodyMd">{message}</Text>
      <br />
      <Text as="span" variant="bodySm" tone="subdued">→ {reason}</Text>
      <Box paddingBlockStart="100">
        <Button size="slim" onClick={run} loading={busy}>
          Suggest with AI
        </Button>
      </Box>
      {result?.error && (
        <Box paddingBlockStart="100">
          <Text as="p" tone="critical" variant="bodySm">{result.error}</Text>
        </Box>
      )}
      {result?.text && !result.error && (
        <Box paddingBlockStart="200" paddingInlineStart="200" borderInlineStartWidth="050" borderColor="border">
          <BlockStack gap="100">
            <Text as="p" variant="bodySm" tone="subdued">
              AI suggestion{result.source === 'cache' ? ' (cached)' : ''}:
            </Text>
            <Text as="p" variant="bodyMd">{result.text}</Text>
          </BlockStack>
        </Box>
      )}
    </List.Item>
  );
}

export default function Audit() {
  const { shop, recent, aiEnabled } = useLoaderData<typeof loader>();
  const data = useActionData<typeof action>();
  const nav = useNavigation();
  const submitting = nav.state === 'submitting';
  const result = data && 'result' in data ? (data.result as AuditResult) : null;
  const error = data && 'error' in data ? data.error : null;
  const applied = data && 'applied' in data ? (data.applied as string[]) : null;
  const fixError = data && 'fixError' in data ? data.fixError : null;
  const fixSubmitting = submitting && nav.formData?.get('intent') === 'fix';
  const fixClassification = result ? classifyFindings(result) : null;
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

                {/* Auto-fix CTA */}
                {fixClassification && fixClassification.fixable.length > 0 && !applied && (
                  <Box paddingBlockStart="200">
                    <BlockStack gap="200">
                      <Banner tone="info" title={`${fixClassification.fixable.length} of ${result.findings.length} findings are auto-fixable`}>
                        <Text as="p" variant="bodyMd">
                          Klyna will write the missing SEO title, description, and Open Graph
                          metadata directly to your Shopify store. Theme- or content-level
                          issues (h1, word count, internal links) are flagged separately below.
                        </Text>
                      </Banner>
                      <Form method="post">
                        <input type="hidden" name="intent" value="fix" />
                        <input type="hidden" name="url" value={result.url} />
                        <Button submit loading={fixSubmitting} variant="primary" tone="success">
                          {`Apply auto-fixes (${fixClassification.fixable.length})`}
                        </Button>
                      </Form>
                      {fixClassification.unfixable.length > 0 && (
                        <BlockStack gap="100">
                          <Text as="h3" variant="headingSm">
                            Manual fixes ({fixClassification.unfixable.length})
                          </Text>
                          {!aiEnabled && (
                            <Text as="p" variant="bodySm" tone="subdued">
                              Want AI-generated copy for these? Add a free key in{' '}
                              <a href="/app/settings">Settings → AI assistant</a>.
                            </Text>
                          )}
                          <List type="bullet">
                            {fixClassification.unfixable.map((u) =>
                              aiEnabled ? (
                                <AiSuggestRow
                                  key={u.id}
                                  id={u.id}
                                  message={u.message}
                                  reason={u.reason}
                                  url={result.url}
                                />
                              ) : (
                                <List.Item key={u.id}>
                                  <Text as="span" variant="bodyMd">{u.message}</Text>
                                  <br />
                                  <Text as="span" variant="bodySm" tone="subdued">→ {u.reason}</Text>
                                </List.Item>
                              ),
                            )}
                          </List>
                        </BlockStack>
                      )}
                    </BlockStack>
                  </Box>
                )}

                {/* Successful fix banner */}
                {applied && applied.length > 0 && (
                  <Box paddingBlockStart="200">
                    <Banner tone="success" title={`Applied ${applied.length} fixes`}>
                      <List type="bullet">
                        {applied.map((line, i) => (
                          <List.Item key={String(i)}>{line}</List.Item>
                        ))}
                      </List>
                      <Box paddingBlockStart="200">
                        <Text as="p" variant="bodySm" tone="subdued">
                          Re-audited above — your new score reflects the changes.
                          Allow a minute for Shopify’s CDN to propagate before checking the storefront.
                        </Text>
                      </Box>
                    </Banner>
                  </Box>
                )}

                {fixError && (
                  <Banner tone="critical" title="Auto-fix failed">
                    <Text as="p" variant="bodyMd">{String(fixError)}</Text>
                  </Banner>
                )}
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
