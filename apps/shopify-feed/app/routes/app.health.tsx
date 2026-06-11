import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/node';
import { Link, useActionData, useLoaderData, useNavigation, useSubmit } from '@remix-run/react';
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  EmptyState,
  InlineStack,
  Layout,
  List,
  Page,
  ProgressBar,
  Text,
} from '@shopify/polaris';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';
import { generateFeed } from '../lib/feeds.server';
import { CHANNELS } from '../lib/channels';
import type { Channel, FeedHealth, HealthIssue } from '../lib/types';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const feeds = await prisma.feed.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: 'asc' },
    include: { runs: { orderBy: { createdAt: 'desc' }, take: 1 } },
  });

  const reports = feeds.map((f) => {
    const last = f.runs[0];
    const health = last ? (JSON.parse(last.health) as FeedHealth) : null;
    return {
      id: f.id,
      name: f.name,
      channel: f.channel as Channel,
      includedCount: last?.includedCount ?? 0,
      generatedAt: last ? last.createdAt.toISOString() : null,
      health,
    };
  });

  return { reports };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const form = await request.formData();
  const feedId = String(form.get('feedId') ?? '');
  if (!feedId) return json({ error: 'Missing feed' }, { status: 400 });

  try {
    const { result } = await generateFeed(admin, {
      feedId,
      shop: session.shop,
      trigger: 'manual',
    });
    return json({
      ok: `Re-scanned — health ${result.health.grade} (${result.health.score}), ${result.health.issues.length} issue type(s).`,
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Scan failed' }, { status: 500 });
  }
};

function gradeTone(grade: string) {
  if (grade === 'A' || grade === 'B') return 'success' as const;
  if (grade === 'C' || grade === 'D') return 'warning' as const;
  return 'critical' as const;
}

function severityTone(sev: HealthIssue['severity']) {
  if (sev === 'error') return 'critical' as const;
  if (sev === 'warn') return 'caution' as const;
  return 'subdued' as const;
}

export default function HealthPage() {
  const { reports } = useLoaderData<typeof loader>();
  const data = useActionData<typeof action>();
  const nav = useNavigation();
  const submit = useSubmit();

  const ok = data && 'ok' in data ? data.ok : null;
  const error = data && 'error' in data ? data.error : null;

  const rescan = (feedId: string) => {
    const fd = new FormData();
    fd.set('feedId', feedId);
    submit(fd, { method: 'post' });
  };

  const hasAny = reports.length > 0;

  return (
    <Page title="Feed health" backAction={{ url: '/app' }}>
      <Layout>
        {ok && (
          <Layout.Section>
            <Banner tone="success" onDismiss={() => undefined}>{String(ok)}</Banner>
          </Layout.Section>
        )}
        {error && (
          <Layout.Section>
            <Banner tone="critical" onDismiss={() => undefined}>{String(error)}</Banner>
          </Layout.Section>
        )}

        {!hasAny && (
          <Layout.Section>
            <Card>
              <EmptyState
                heading="No feeds to check"
                action={{ content: 'Create a feed', url: '/app/feeds/new' }}
                image=""
              >
                <p>Create a feed and Klyna will report missing fields and quality issues here.</p>
              </EmptyState>
            </Card>
          </Layout.Section>
        )}

        {reports.map((r) => (
          <Layout.Section key={r.id}>
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="050">
                    <InlineStack gap="200" blockAlign="center">
                      <Text as="h2" variant="headingMd">{r.name}</Text>
                      <Badge>{CHANNELS[r.channel].label}</Badge>
                      {r.health && (
                        <Badge tone={gradeTone(r.health.grade)}>
                          {`${r.health.grade} · ${r.health.score}`}
                        </Badge>
                      )}
                    </InlineStack>
                    <Text as="span" variant="bodySm" tone="subdued">
                      {r.includedCount} items
                      {r.generatedAt
                        ? ` · scanned ${new Date(r.generatedAt).toLocaleString()}`
                        : ' · never scanned'}
                    </Text>
                  </BlockStack>
                  <InlineStack gap="200">
                    <Button
                      onClick={() => rescan(r.id)}
                      loading={nav.state !== 'idle' && nav.formData?.get('feedId') === r.id}
                    >
                      Re-scan
                    </Button>
                    <Link to={`/app/feeds/${r.id}`}>Fix mapping →</Link>
                  </InlineStack>
                </InlineStack>

                {!r.health && (
                  <Banner tone="info">
                    This feed has not been generated yet. Re-scan to compute its health.
                  </Banner>
                )}

                {r.health && (
                  <BlockStack gap="300">
                    <Box>
                      <ProgressBar
                        progress={r.health.score}
                        tone={r.health.score >= 80 ? 'success' : r.health.score >= 60 ? 'highlight' : 'critical'}
                        size="small"
                      />
                    </Box>

                    {r.health.issues.length === 0 ? (
                      <Banner tone="success">
                        No issues found — every item has all required and recommended fields.
                      </Banner>
                    ) : (
                      <List type="bullet">
                        {r.health.issues.map((issue) => (
                          <List.Item key={issue.id}>
                            <InlineStack gap="200" blockAlign="center">
                              <Text as="span" tone={severityTone(issue.severity)} fontWeight="medium">
                                [{issue.severity.toUpperCase()}]
                              </Text>
                              <Text as="span">{issue.message}</Text>
                              <Badge>{`${issue.count} item${issue.count === 1 ? '' : 's'}`}</Badge>
                            </InlineStack>
                            {issue.sampleIds.length > 0 && (
                              <Text as="span" variant="bodySm" tone="subdued">
                                {' '}e.g. {issue.sampleIds.join(', ')}
                              </Text>
                            )}
                          </List.Item>
                        ))}
                      </List>
                    )}
                  </BlockStack>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        ))}
      </Layout>
    </Page>
  );
}
