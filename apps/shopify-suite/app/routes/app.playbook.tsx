import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  type SerializeFrom,
  json,
} from '@remix-run/node';
import {
  Form,
  useActionData,
  useLoaderData,
  useNavigation,
  useRevalidator,
} from '@remix-run/react';
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  Checkbox,
  Divider,
  InlineGrid,
  InlineStack,
  Layout,
  List,
  Page,
  Text,
  TextField,
} from '@shopify/polaris';
import { useEffect, useState } from 'react';
import prisma from '../db.server';
import {
  type Finding,
  type ProductKey,
  type Metric as ProductMetric,
  getProductKey,
  products,
} from '../lib/products';
import { buildReport } from '../lib/scanners.server';
import { type ShopSnapshot, getShopSnapshot } from '../lib/shopify-data.server';
import { authenticate } from '../shopify.server';

const guideSteps = {
  cleanroom: [
    'Duplicate the live theme before editing any old app code.',
    'Remove only snippets with clear source evidence and no matching installed app.',
    'Check homepage, product page, cart, and checkout handoff after cleanup.',
    'Record before/after script count and keep rollback notes for support.',
  ],
  'promo-qa': [
    'Build launch scenarios for top products, markets, and customer tags.',
    'Test code discounts against automatic discounts and free-shipping thresholds.',
    'Mark unsupported stacking as expected behavior before support tickets arrive.',
    'Set discount expiry dates and margin guardrails before paid traffic starts.',
  ],
  'pixel-doctor': [
    'Choose a single source of truth for each ad platform.',
    'Remove hardcoded pixels only after Customer Events or native integrations are verified.',
    'Confirm consent signals load before marketing tags for regulated markets.',
    'Check event IDs and product IDs in each ad platform after changes.',
  ],
  'feed-doctor': [
    'Fix missing GTIN/barcode, brand, image, and SKU before scaling Shopping ads.',
    'Use metafields for channel-specific product titles and descriptions.',
    'Separate custom products from manufactured products in feed settings.',
    'Run diagnostics after imports, vendor uploads, and product launches.',
  ],
};

type RedirectRisk = {
  id: string;
  severity: 'critical' | 'warning';
  title: string;
  detail: string;
};

type WorkspaceLink = {
  label: string;
  url: string;
  detail: string;
};

type WorkspaceItem = {
  id: string;
  title: string;
  detail: string;
  evidence: string;
  action: string;
  actionLabel: string;
  tone: 'critical' | 'warning' | 'info' | 'success';
  workflowStatus?: FixTaskStatus;
  workflowUpdatedAt?: string | null;
  adminUrl?: string;
  storefrontUrl?: string;
};

type FixTaskStatus = 'open' | 'done' | 'snoozed';

type ProductWorkspace = {
  title: string;
  subtitle: string;
  summary: string;
  metrics: ProductMetric[];
  items: WorkspaceItem[];
  quickLinks: WorkspaceLink[];
  generatedAt: string;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const productKey = getProductKey();
  const product = products[productKey];

  if (productKey !== 'redirect-guard') {
    const snapshot = await getShopSnapshot(admin, productKey);
    const report = await buildReport(productKey, snapshot);
    const states = await prisma.fixTaskState.findMany({
      where: { shop: session.shop, productKey },
    });

    return json({
      mode: 'workspace' as const,
      product,
      shop: session.shop,
      workspace: applyWorkflowStates(buildProductWorkspace(productKey, snapshot, report), states),
    });
  }

  const snapshot = await getShopSnapshot(admin, productKey);
  const currentContent = contentInventory(snapshot);
  const currentPaths = currentContent.map((item) => item.path);
  const baseline = await prisma.redirectInventory.findFirst({
    where: { shop: session.shop },
    orderBy: { createdAt: 'desc' },
  });
  const baselinePaths = parsePaths(baseline?.paths);
  const redirectSources = new Set(snapshot.redirects.map((redirect) => redirect.path));
  const removedPaths = baselinePaths.filter(
    (path) => !currentPaths.includes(path) && !redirectSources.has(path),
  );
  const risks = redirectRisks(snapshot);
  const changes = await prisma.redirectChange.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: 'desc' },
    take: 12,
  });

  return json({
    mode: 'redirect' as const,
    product,
    shop: session.shop,
    primaryDomainUrl: snapshot.primaryDomainUrl,
    currentContent,
    currentPathCount: currentPaths.length,
    baseline: baseline
      ? { createdAtLabel: formatDate(baseline.createdAt), pathCount: baselinePaths.length }
      : null,
    removedPaths,
    risks,
    redirects: snapshot.redirects,
    changes: changes.map((change) => ({
      id: change.id,
      path: change.path,
      target: change.target,
      createdAtLabel: formatDate(change.createdAt),
    })),
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const productKey = getProductKey();
  const form = await request.formData();
  const intent = String(form.get('intent') ?? '');

  if (intent === 'update-workspace-item') {
    const itemId = String(form.get('itemId') ?? '');
    const status = parseFixTaskStatus(String(form.get('status') ?? ''));

    if (!itemId || !status) {
      return json({ error: 'Choose a valid queue item and status.' }, { status: 400 });
    }

    await prisma.fixTaskState.upsert({
      where: { shop_productKey_itemId: { shop: session.shop, productKey, itemId } },
      update: { status },
      create: { shop: session.shop, productKey, itemId, status },
    });

    return json({
      itemUpdated: true,
      message:
        status === 'done'
          ? 'Fix marked done. Rerun the scan when the Shopify change is saved.'
          : status === 'snoozed'
            ? 'Fix snoozed. It stays in the queue for the next review.'
            : 'Fix reopened.',
    });
  }

  if (productKey !== 'redirect-guard') {
    return json(
      { error: 'Redirect actions are only available in Redirect Guard.' },
      { status: 400 },
    );
  }

  const snapshot = await getShopSnapshot(admin, 'redirect-guard');
  const currentPaths = contentInventory(snapshot).map((item) => item.path);

  if (intent === 'save-baseline') {
    await prisma.redirectInventory.create({
      data: { shop: session.shop, paths: JSON.stringify(currentPaths) },
    });
    return json({ baselineSaved: true, message: `${currentPaths.length} live paths saved.` });
  }

  if (intent !== 'create-redirect') {
    return json({ error: 'Unknown redirect action.' }, { status: 400 });
  }

  if (form.get('confirmed') !== 'yes') {
    return json({ error: 'Review and confirm the redirect before creating it.' }, { status: 400 });
  }

  const path = normalizePath(String(form.get('path') ?? ''));
  const target = normalizePath(String(form.get('target') ?? ''));
  const validationError = validateRedirect(path, target, currentPaths, snapshot);
  if (validationError) return json({ error: validationError }, { status: 400 });

  const targetError = await verifyTarget(snapshot.primaryDomainUrl, target);
  if (targetError) return json({ error: targetError }, { status: 400 });

  const response = await admin.graphql(
    `#graphql
      mutation KlynaUrlRedirectCreate($urlRedirect: UrlRedirectInput!) {
        urlRedirectCreate(urlRedirect: $urlRedirect) {
          urlRedirect { id path target }
          userErrors { field message }
        }
      }`,
    { variables: { urlRedirect: { path, target } } },
  );
  const payload = (await response.json()) as {
    data?: {
      urlRedirectCreate?: {
        urlRedirect?: { id: string; path: string; target: string } | null;
        userErrors: { message: string }[];
      };
    };
    errors?: { message: string }[];
  };
  const mutation = payload.data?.urlRedirectCreate;
  const mutationError = payload.errors?.[0]?.message ?? mutation?.userErrors?.[0]?.message;
  if (mutationError || !mutation?.urlRedirect) {
    return json(
      {
        error:
          mutationError ??
          'Shopify did not create the redirect. Reopen the app to approve its redirect permission.',
      },
      { status: 400 },
    );
  }

  await prisma.redirectChange.create({
    data: {
      shop: session.shop,
      path: mutation.urlRedirect.path,
      target: mutation.urlRedirect.target,
      shopifyId: mutation.urlRedirect.id,
    },
  });

  return json({
    created: true,
    message: `${mutation.urlRedirect.path} now redirects to ${mutation.urlRedirect.target}.`,
  });
};

export default function Playbook() {
  const data = useLoaderData<typeof loader>();
  if (data.mode === 'workspace') return <ProductFixWorkspace data={data} />;
  return <RedirectWorkspace data={data} />;
}

type LoaderData = SerializeFrom<typeof loader>;
type ProductWorkspaceData = Extract<LoaderData, { mode: 'workspace' }>;
type RedirectWorkspaceData = Extract<LoaderData, { mode: 'redirect' }>;

function ProductFixWorkspace({ data }: { data: ProductWorkspaceData }) {
  const { product, workspace } = data;
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const activeItemId = String(navigation.formData?.get('itemId') ?? '');
  const isSubmitting = navigation.state !== 'idle';
  const openCount = workspace.items.filter(
    (item) => (item.workflowStatus ?? 'open') === 'open',
  ).length;
  const doneCount = workspace.items.filter((item) => item.workflowStatus === 'done').length;
  const snoozedCount = workspace.items.filter((item) => item.workflowStatus === 'snoozed').length;

  return (
    <Page
      title={workspace.title}
      subtitle={workspace.subtitle}
      primaryAction={{
        content: 'Export fix queue',
        onAction: () => downloadWorkspace(product.name, workspace.items),
      }}
    >
      <Layout>
        {actionData && 'error' in actionData && actionData.error ? (
          <Layout.Section>
            <Banner tone="critical" title="Queue update failed">
              <Text as="p">{actionData.error}</Text>
            </Banner>
          </Layout.Section>
        ) : null}
        {actionData && 'message' in actionData && actionData.message ? (
          <Layout.Section>
            <Banner tone="success" title="Queue updated">
              <Text as="p">{actionData.message}</Text>
            </Banner>
          </Layout.Section>
        ) : null}

        <Layout.Section>
          <div className="KlynaDashboardLead KlynaDashboardLead--workspace">
            <div className="KlynaDashboardLead__copy">
              <InlineStack gap="200" blockAlign="center">
                <p className="KlynaEyebrow">{product.shortName} workspace</p>
                <Badge
                  tone={
                    workspace.items.some((item) => item.tone === 'critical') ? 'critical' : 'info'
                  }
                >
                  {`${workspace.items.length} queued`}
                </Badge>
              </InlineStack>
              <h2 className="KlynaLeadTitle">{product.workspaceDescription}</h2>
              <p className="KlynaLeadBody">{workspace.summary}</p>
              <div className="KlynaSignalRow" aria-label="Fix queue progress">
                <span>
                  <strong>{openCount}</strong> open
                </span>
                <span>
                  <strong>{doneCount}</strong> done
                </span>
                <span>
                  <strong>{snoozedCount}</strong> snoozed
                </span>
              </div>
            </div>
            <div className="KlynaWorkspaceStamp">
              <span>Last checked</span>
              <strong>{formatIsoDate(workspace.generatedAt)}</strong>
            </div>
          </div>
        </Layout.Section>

        <Layout.Section>
          <Card padding="0">
            <div className="KlynaMetricStrip">
              {workspace.metrics.map((metric) => (
                <div className="KlynaMetric" key={metric.label}>
                  <span className="KlynaMetric__label">{metric.label}</span>
                  <strong
                    className={`KlynaMetric__value${metric.tone === 'critical' ? ' KlynaMetric__value--critical' : metric.tone === 'warning' ? ' KlynaMetric__value--warning' : metric.tone === 'success' ? ' KlynaMetric__value--success' : ''}`}
                  >
                    {metric.value}
                  </strong>
                </div>
              ))}
            </div>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <div className="KlynaWorkspaceGrid">
            <Card>
              <BlockStack gap="300">
                <div className="KlynaSectionHeader">
                  <div>
                    <h2>Prioritized fix queue</h2>
                    <p>Open the Shopify record, make the change, then rerun the dashboard scan.</p>
                  </div>
                </div>
                {workspace.items.map((item) => (
                  <div
                    className="KlynaFinding"
                    data-severity={item.tone}
                    data-workflow-status={item.workflowStatus ?? 'open'}
                    key={item.id}
                  >
                    <BlockStack gap="150">
                      <InlineStack align="space-between" gap="200">
                        <Text as="h3" variant="headingSm">
                          {item.title}
                        </Text>
                        <InlineStack gap="150">
                          <Badge tone={workflowBadgeTone(item.workflowStatus ?? 'open')}>
                            {workflowStatusLabel(item.workflowStatus ?? 'open')}
                          </Badge>
                          <Badge tone={badgeTone(item.tone)}>{labelFor(item.tone)}</Badge>
                        </InlineStack>
                      </InlineStack>
                      <Text as="p">{item.detail}</Text>
                      <Text as="p" tone="subdued">
                        Evidence: {item.evidence}
                      </Text>
                      <Text as="p" tone="subdued">
                        Next step: {item.action}
                      </Text>
                      {item.workflowUpdatedAt ? (
                        <Text as="p" tone="subdued">
                          Queue updated: {item.workflowUpdatedAt}
                        </Text>
                      ) : null}
                      <InlineStack gap="200" blockAlign="center">
                        {item.adminUrl ? (
                          <Button size="slim" url={item.adminUrl} external>
                            {item.actionLabel}
                          </Button>
                        ) : null}
                        {item.storefrontUrl ? (
                          <Button size="slim" url={item.storefrontUrl} external>
                            View storefront page
                          </Button>
                        ) : null}
                        {(item.workflowStatus ?? 'open') !== 'done' ? (
                          <Form method="post">
                            <input type="hidden" name="intent" value="update-workspace-item" />
                            <input type="hidden" name="itemId" value={item.id} />
                            <input type="hidden" name="status" value="done" />
                            <Button
                              submit
                              size="slim"
                              variant="primary"
                              loading={isSubmitting && activeItemId === item.id}
                            >
                              Mark done
                            </Button>
                          </Form>
                        ) : null}
                        {(item.workflowStatus ?? 'open') === 'open' ? (
                          <Form method="post">
                            <input type="hidden" name="intent" value="update-workspace-item" />
                            <input type="hidden" name="itemId" value={item.id} />
                            <input type="hidden" name="status" value="snoozed" />
                            <Button
                              submit
                              size="slim"
                              loading={isSubmitting && activeItemId === item.id}
                            >
                              Snooze
                            </Button>
                          </Form>
                        ) : (
                          <Form method="post">
                            <input type="hidden" name="intent" value="update-workspace-item" />
                            <input type="hidden" name="itemId" value={item.id} />
                            <input type="hidden" name="status" value="open" />
                            <Button
                              submit
                              size="slim"
                              loading={isSubmitting && activeItemId === item.id}
                            >
                              Reopen
                            </Button>
                          </Form>
                        )}
                      </InlineStack>
                    </BlockStack>
                  </div>
                ))}
              </BlockStack>
            </Card>

            <div className="KlynaSidebar">
              <Card>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    Shopify shortcuts
                  </Text>
                  {workspace.quickLinks.map((link) => (
                    <a
                      className="KlynaShortcut"
                      href={link.url}
                      target="_blank"
                      rel="noreferrer"
                      key={link.label}
                    >
                      <span>{link.label}</span>
                      <small>{link.detail}</small>
                    </a>
                  ))}
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    Working rule
                  </Text>
                  <List type="bullet">
                    {(guideSteps[product.key as keyof typeof guideSteps] ?? []).map((step) => (
                      <List.Item key={step}>{step}</List.Item>
                    ))}
                  </List>
                </BlockStack>
              </Card>
            </div>
          </div>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

function RedirectWorkspace({ data }: { data: RedirectWorkspaceData }) {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const [path, setPath] = useState('');
  const [target, setTarget] = useState('/');
  const [confirmed, setConfirmed] = useState(false);
  const isSubmitting = navigation.state !== 'idle';

  useEffect(() => {
    if (actionData && ('created' in actionData || 'baselineSaved' in actionData)) {
      setConfirmed(false);
      void revalidator.revalidate();
    }
  }, [actionData, revalidator]);

  return (
    <Page
      title="Redirect workspace"
      subtitle={data.product.workspaceDescription}
      primaryAction={{
        content: 'Export redirect map',
        onAction: () => downloadRedirects(data.redirects),
      }}
    >
      <Layout>
        {actionData && 'error' in actionData && actionData.error ? (
          <Layout.Section>
            <Banner tone="critical" title="Redirect was not created">
              <Text as="p">{actionData.error}</Text>
            </Banner>
          </Layout.Section>
        ) : null}
        {actionData && 'message' in actionData && actionData.message ? (
          <Layout.Section>
            <Banner tone="success" title="Workspace updated">
              <Text as="p">{actionData.message}</Text>
            </Banner>
          </Layout.Section>
        ) : null}

        <Layout.Section>
          <InlineGrid columns={{ xs: 2, md: 4 }} gap="300">
            <Metric label="Live paths" value={String(data.currentPathCount)} />
            <Metric label="Redirects" value={String(data.redirects.length)} />
            <Metric
              label="Unprotected removals"
              value={String(data.removedPaths.length)}
              tone={data.removedPaths.length ? 'critical' : 'success'}
            />
            <Metric
              label="Map risks"
              value={String(data.risks.length)}
              tone={data.risks.length ? 'warning' : 'success'}
            />
          </InlineGrid>
        </Layout.Section>

        <Layout.Section>
          <InlineGrid columns={{ xs: 1, lg: 2 }} gap="400">
            <Card>
              <Form method="post">
                <input type="hidden" name="intent" value="create-redirect" />
                <input type="hidden" name="confirmed" value={confirmed ? 'yes' : 'no'} />
                <BlockStack gap="300">
                  <BlockStack gap="100">
                    <Text as="h2" variant="headingMd">
                      Create a protected redirect
                    </Text>
                    <Text as="p" tone="subdued">
                      Source paths must be retired URLs. Klyna blocks live catalog paths, duplicate
                      redirect sources, loops, and destinations that return an error.
                    </Text>
                  </BlockStack>
                  <TextField
                    label="Retired source path"
                    name="path"
                    value={path}
                    onChange={setPath}
                    placeholder="/products/old-handle"
                    autoComplete="off"
                    helpText={`Path on ${data.primaryDomainUrl}`}
                  />
                  <TextField
                    label="Live destination path"
                    name="target"
                    value={target}
                    onChange={setTarget}
                    placeholder="/products/new-handle"
                    autoComplete="off"
                  />
                  <Checkbox
                    label={`I reviewed ${path || 'the source'} → ${target || 'the destination'}`}
                    checked={confirmed}
                    onChange={setConfirmed}
                  />
                  <InlineStack gap="200" blockAlign="center">
                    <Button
                      submit
                      variant="primary"
                      loading={isSubmitting}
                      disabled={!path || !target || !confirmed}
                    >
                      Validate and create redirect
                    </Button>
                    <Text as="span" tone="subdued">
                      One explicit change. No bulk or silent edits.
                    </Text>
                  </InlineStack>
                </BlockStack>
              </Form>
            </Card>

            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="100">
                    <Text as="h2" variant="headingMd">
                      URL-loss baseline
                    </Text>
                    <Text as="p" tone="subdued">
                      Save today&apos;s live catalog and content paths. Future checks flag paths
                      that disappear without redirect coverage.
                    </Text>
                  </BlockStack>
                  <Badge tone={data.baseline ? 'success' : 'warning'}>
                    {data.baseline ? 'Monitoring' : 'Not started'}
                  </Badge>
                </InlineStack>
                {data.baseline ? (
                  <Text as="p">
                    Last baseline: {data.baseline.createdAtLabel} · {data.baseline.pathCount} paths
                  </Text>
                ) : (
                  <Banner tone="warning">No URL baseline exists yet.</Banner>
                )}
                <Form method="post">
                  <input type="hidden" name="intent" value="save-baseline" />
                  <Button submit loading={isSubmitting}>
                    {data.baseline ? 'Refresh baseline' : 'Save first baseline'}
                  </Button>
                </Form>
                <Text as="p" tone="subdued">
                  Refresh only after reviewing and protecting legitimate URL removals.
                </Text>
              </BlockStack>
            </Card>
          </InlineGrid>
        </Layout.Section>

        <Layout.Section>
          <InlineGrid columns={{ xs: 1, lg: 2 }} gap="400">
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">
                    Unprotected removals
                  </Text>
                  <Badge tone={data.removedPaths.length ? 'critical' : 'success'}>
                    {String(data.removedPaths.length)}
                  </Badge>
                </InlineStack>
                {data.removedPaths.length ? (
                  <BlockStack gap="200">
                    {data.removedPaths.map((removedPath) => (
                      <Box key={removedPath} padding="300" borderWidth="025" borderColor="border">
                        <InlineStack align="space-between" blockAlign="center" gap="200">
                          <Text as="p" fontWeight="semibold">
                            {removedPath}
                          </Text>
                          <Button
                            size="slim"
                            onClick={() => {
                              setPath(removedPath);
                              setConfirmed(false);
                            }}
                          >
                            Prepare fix
                          </Button>
                        </InlineStack>
                      </Box>
                    ))}
                  </BlockStack>
                ) : (
                  <Text as="p" tone="subdued">
                    {data.baseline
                      ? 'No baseline paths disappeared without redirect coverage.'
                      : 'Save a baseline to begin deletion and handle-change monitoring.'}
                  </Text>
                )}
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">
                    Redirect-map risks
                  </Text>
                  <Badge tone={data.risks.length ? 'warning' : 'success'}>
                    {String(data.risks.length)}
                  </Badge>
                </InlineStack>
                {data.risks.length ? (
                  <BlockStack gap="200">
                    {data.risks.map((risk) => (
                      <Box key={risk.id} padding="300" borderWidth="025" borderColor="border">
                        <BlockStack gap="100">
                          <InlineStack align="space-between">
                            <Text as="h3" variant="headingSm">
                              {risk.title}
                            </Text>
                            <Badge tone={risk.severity === 'critical' ? 'critical' : 'warning'}>
                              {risk.severity}
                            </Badge>
                          </InlineStack>
                          <Text as="p" tone="subdued">
                            {risk.detail}
                          </Text>
                        </BlockStack>
                      </Box>
                    ))}
                  </BlockStack>
                ) : (
                  <Text as="p" tone="subdued">
                    No redirect loops, self-redirects, or chains were found in the current map.
                  </Text>
                )}
              </BlockStack>
            </Card>
          </InlineGrid>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingMd">
                    Existing redirect map
                  </Text>
                  <Text as="p" tone="subdued">
                    Current Shopify redirects. Export the full map before a migration or catalog
                    cleanup.
                  </Text>
                </BlockStack>
                <Button onClick={() => downloadRedirects(data.redirects)}>Download CSV</Button>
              </InlineStack>
              <Divider />
              {data.redirects.length ? (
                <BlockStack gap="150">
                  {data.redirects.slice(0, 25).map((redirect) => (
                    <InlineStack key={redirect.id} align="space-between" gap="300">
                      <Text as="span" fontWeight="semibold">
                        {redirect.path}
                      </Text>
                      <Text as="span" tone="subdued">
                        → {redirect.target}
                      </Text>
                    </InlineStack>
                  ))}
                  {data.redirects.length > 25 ? (
                    <Text as="p" tone="subdued">
                      Showing 25 of {data.redirects.length}. Download CSV for the complete map.
                    </Text>
                  ) : null}
                </BlockStack>
              ) : (
                <Text as="p" tone="subdued">
                  No Shopify redirects currently exist.
                </Text>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Klyna change log
              </Text>
              {data.changes.length ? (
                <List type="bullet">
                  {data.changes.map((change) => (
                    <List.Item key={change.id}>
                      {change.path} → {change.target} · {change.createdAtLabel}
                    </List.Item>
                  ))}
                </List>
              ) : (
                <Text as="p" tone="subdued">
                  Redirects created from this workspace will appear here with timestamps.
                </Text>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

function buildProductWorkspace(
  productKey: Exclude<ProductKey, 'redirect-guard'>,
  snapshot: ShopSnapshot,
  report: { summary: string; metrics: ProductMetric[]; findings: Finding[]; generatedAt: string },
): ProductWorkspace {
  const base = shopifyAdminBase(snapshot);

  switch (productKey) {
    case 'cleanroom':
      return {
        title: 'Cleanup queue',
        subtitle: 'Theme and app residue evidence from the current storefront.',
        summary:
          'Klyna samples live storefront HTML, highlights repeated app signatures and duplicate tracking, then packages a safe developer handoff.',
        metrics: report.metrics,
        generatedAt: report.generatedAt,
        quickLinks: [
          link('Theme library', `${base}/themes`, 'Duplicate the live theme before code cleanup.'),
          link(
            'Installed apps',
            `${base}/settings/apps`,
            'Match script evidence to the active app stack.',
          ),
          link('Online Store', `${base}/online_store`, 'Review storefront surfaces after cleanup.'),
        ],
        items: findingsToWorkspaceItems(report.findings, {
          actionLabel: 'Open theme library',
          adminUrl: `${base}/themes`,
        }),
      };
    case 'promo-qa':
      return promoWorkspace(snapshot, report, base);
    case 'pixel-doctor':
      return {
        title: 'Tracking evidence map',
        subtitle: 'Duplicate event, platform, and consent signals from sampled storefront pages.',
        summary:
          'Use this map to identify which app, customer event, or theme snippet should own each marketing signal before paid traffic scales.',
        metrics: report.metrics,
        generatedAt: report.generatedAt,
        quickLinks: [
          link(
            'Customer events',
            `${base}/settings/customer_events`,
            'Audit Shopify pixel sources.',
          ),
          link(
            'Privacy settings',
            `${base}/settings/privacy`,
            'Confirm consent collection settings.',
          ),
          link('Theme library', `${base}/themes`, 'Check hardcoded pixels in theme code.'),
        ],
        items: findingsToWorkspaceItems(report.findings, {
          actionLabel: 'Open customer events',
          adminUrl: `${base}/settings/customer_events`,
        }),
      };
    case 'feed-doctor':
      return feedWorkspace(snapshot, report, base);
  }
}

function applyWorkflowStates(
  workspace: ProductWorkspace,
  states: { itemId: string; status: string; updatedAt: Date }[],
): ProductWorkspace {
  const stateMap = new Map(states.map((state) => [state.itemId, state]));

  return {
    ...workspace,
    items: workspace.items
      .map((item) => {
        const state = stateMap.get(item.id);
        const workflowStatus = parseFixTaskStatus(state?.status ?? '') ?? 'open';

        return {
          ...item,
          workflowStatus,
          workflowUpdatedAt: state ? formatDate(state.updatedAt) : null,
        };
      })
      .sort((a, b) => {
        const workflowDiff =
          workflowRank(a.workflowStatus ?? 'open') - workflowRank(b.workflowStatus ?? 'open');
        if (workflowDiff !== 0) return workflowDiff;
        return severityRank(a.tone) - severityRank(b.tone);
      }),
  };
}

function parseFixTaskStatus(value: string): FixTaskStatus | null {
  if (value === 'open' || value === 'done' || value === 'snoozed') return value;
  return null;
}

function workflowRank(status: FixTaskStatus) {
  if (status === 'open') return 0;
  if (status === 'snoozed') return 1;
  return 2;
}

function severityRank(tone: WorkspaceItem['tone']) {
  if (tone === 'critical') return 0;
  if (tone === 'warning') return 1;
  if (tone === 'info') return 2;
  return 3;
}

function promoWorkspace(
  snapshot: ShopSnapshot,
  report: { metrics: ProductMetric[]; findings: Finding[]; generatedAt: string },
  base: string,
): ProductWorkspace {
  const activeDiscounts = snapshot.discounts.filter((discount) => discount.status === 'ACTIVE');
  const items =
    activeDiscounts.length > 0
      ? activeDiscounts.slice(0, 25).map((discount) => {
          const combines = discount.combinesWith;
          const combineValues = combines
            ? [
                combines.orderDiscounts ? 'order' : null,
                combines.productDiscounts ? 'product' : null,
                combines.shippingDiscounts ? 'shipping' : null,
              ].filter(Boolean)
            : [];
          const hasNoCombinations = Boolean(combines) && combineValues.length === 0;
          const hasNoExpiry = !discount.endsAt;
          const tone = hasNoCombinations ? 'critical' : hasNoExpiry ? 'warning' : 'info';
          const detailParts = [
            discount.type.replace(/^Discount/, ''),
            discount.endsAt ? `ends ${formatIsoDate(discount.endsAt)}` : 'no end date',
            combineValues.length ? `combines with ${combineValues.join(', ')}` : 'does not combine',
          ];

          return {
            id: `promo-${discount.id}`,
            title: discount.title,
            detail: detailParts.join(' · '),
            evidence: discount.status ?? 'ACTIVE',
            action: hasNoCombinations
              ? 'Open the discount, document the winning rule, and test the campaign cart before launch.'
              : hasNoExpiry
                ? 'Add an end date or an owner reminder before launching paid traffic.'
                : 'Keep this discount in the launch checklist and test it against top campaign products.',
            actionLabel: 'Open discount',
            tone,
            adminUrl: discountAdminUrl(base, discount.id),
          } satisfies WorkspaceItem;
        })
      : [
          {
            id: 'promo-empty',
            title: 'No active discounts found',
            detail: 'Klyna did not find active Shopify discounts in the current sample.',
            evidence: '0 active discounts',
            action:
              'Create or schedule the campaign discount, then rerun Promo QA before publishing the sale.',
            actionLabel: 'Open discounts',
            tone: 'info',
            adminUrl: `${base}/discounts`,
          } satisfies WorkspaceItem,
        ];

  return {
    title: 'Launch QA board',
    subtitle: 'Active discounts, expiry gaps, stacking risk, and campaign test scenarios.',
    summary:
      'Promo QA turns discount settings into a launch board so marketing, ops, and support know what will happen before customers hit checkout.',
    metrics: report.metrics,
    generatedAt: report.generatedAt,
    quickLinks: [
      link('Discounts', `${base}/discounts`, 'Edit code and automatic discounts.'),
      link('Products', `${base}/products`, 'Open the products used in launch carts.'),
      link('Markets', `${base}/settings/markets`, 'Confirm market-specific campaign assumptions.'),
    ],
    items,
  };
}

function feedWorkspace(
  snapshot: ShopSnapshot,
  report: { metrics: ProductMetric[]; findings: Finding[]; generatedAt: string },
  base: string,
): ProductWorkspace {
  const productItems = snapshot.products
    .map((product) => {
      const missingBarcode = product.variants.filter((variant) => !variant.barcode).length;
      const missingSku = product.variants.filter((variant) => !variant.sku).length;
      const gaps = [
        !product.vendor ? 'brand/vendor' : null,
        !product.imageUrl ? 'featured image' : null,
        !product.seoTitle ? 'SEO title' : null,
        !product.seoDescription ? 'SEO description' : null,
        missingBarcode ? `${missingBarcode} GTIN/barcode` : null,
        missingSku ? `${missingSku} SKU` : null,
      ].filter(Boolean) as string[];

      if (gaps.length === 0) return null;

      return {
        id: `feed-${product.id}`,
        title: product.title,
        detail: `Missing ${gaps.join(', ')}.`,
        evidence: `${product.variants.length} variants sampled`,
        action:
          'Open the product in Shopify, fill the missing commerce fields, then rerun Feed Doctor before submitting feeds.',
        actionLabel: 'Open product',
        tone: !product.imageUrl || missingBarcode > 0 ? 'critical' : 'warning',
        adminUrl: productAdminUrl(base, product.id),
        storefrontUrl: product.onlineStoreUrl ?? undefined,
      } satisfies WorkspaceItem;
    })
    .filter(Boolean) as WorkspaceItem[];

  return {
    title: 'Catalog fix queue',
    subtitle:
      'Product and variant records that can block Shopping, catalog, or marketplace quality.',
    summary:
      'Feed Doctor prioritizes the catalog fields merchants can fix directly in Shopify before Google Merchant Center or marketplace syncs complain.',
    metrics: report.metrics,
    generatedAt: report.generatedAt,
    quickLinks: [
      link('Products', `${base}/products`, 'Edit product feed-critical fields.'),
      link('Inventory', `${base}/products/inventory`, 'Review SKU and inventory data.'),
      link('Markets', `${base}/settings/markets`, 'Check cross-market catalog readiness.'),
    ],
    items:
      productItems.length > 0
        ? productItems.slice(0, 30)
        : findingsToWorkspaceItems(report.findings, {
            actionLabel: 'Open products',
            adminUrl: `${base}/products`,
          }),
  };
}

function findingsToWorkspaceItems(
  findings: Finding[],
  options: { actionLabel: string; adminUrl: string },
): WorkspaceItem[] {
  return findings.map((finding) => ({
    id: finding.id,
    title: finding.title,
    detail: finding.detail,
    evidence: finding.evidence ?? labelFor(finding.severity),
    action: finding.action,
    actionLabel: options.actionLabel,
    tone: finding.severity,
    adminUrl: options.adminUrl,
  }));
}

function shopifyAdminBase(snapshot: ShopSnapshot) {
  return `https://admin.shopify.com/store/${snapshot.myshopifyDomain.replace(/\.myshopify\.com$/, '')}`;
}

function productAdminUrl(base: string, gid: string) {
  return `${base}/products/${numericId(gid)}`;
}

function discountAdminUrl(base: string, gid: string) {
  return `${base}/discounts/${numericId(gid)}`;
}

function numericId(gid: string) {
  return gid.split('/').pop() ?? gid;
}

function link(label: string, url: string, detail: string): WorkspaceLink {
  return { label, url, detail };
}

function badgeTone(severity: string) {
  if (severity === 'critical') return 'critical' as const;
  if (severity === 'warning') return 'warning' as const;
  if (severity === 'success') return 'success' as const;
  return 'info' as const;
}

function workflowBadgeTone(status: FixTaskStatus) {
  if (status === 'done') return 'success' as const;
  if (status === 'snoozed') return 'warning' as const;
  return 'info' as const;
}

function workflowStatusLabel(status: FixTaskStatus) {
  if (status === 'done') return 'Done';
  if (status === 'snoozed') return 'Snoozed';
  return 'Open';
}

function labelFor(value: string) {
  return value
    .split(/[-_]/)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function Metric({
  label,
  value,
  tone,
}: { label: string; value: string; tone?: 'success' | 'warning' | 'critical' }) {
  return (
    <Card>
      <BlockStack gap="100">
        <Text as="p" tone="subdued">
          {label}
        </Text>
        <InlineStack gap="200" blockAlign="center">
          <Text as="p" variant="headingLg" fontWeight="bold">
            {value}
          </Text>
          {tone ? <Badge tone={tone}>{tone === 'success' ? 'Clear' : 'Review'}</Badge> : null}
        </InlineStack>
      </BlockStack>
    </Card>
  );
}

function contentInventory(snapshot: ShopSnapshot) {
  return [
    ...snapshot.products.map((item) => ({
      type: 'Product',
      title: item.title,
      path: urlPath(item.onlineStoreUrl),
    })),
    ...snapshot.collections.map((item) => ({
      type: 'Collection',
      title: item.title,
      path: urlPath(item.onlineStoreUrl),
    })),
    ...snapshot.pages.map((item) => ({
      type: 'Page',
      title: item.title,
      path: urlPath(item.onlineStoreUrl),
    })),
  ].filter((item): item is { type: string; title: string; path: string } => Boolean(item.path));
}

function urlPath(value?: string | null) {
  if (!value) return null;
  try {
    return new URL(value).pathname.replace(/\/$/, '') || '/';
  } catch {
    return null;
  }
}

function parsePaths(value?: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

function normalizePath(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const withSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withSlash.length > 1 ? withSlash.replace(/\/$/, '') : withSlash;
}

function validateRedirect(
  path: string,
  target: string,
  currentPaths: string[],
  snapshot: ShopSnapshot,
) {
  if (!path || !target) return 'Enter both a retired source path and a live destination path.';
  if (
    path.startsWith('//') ||
    target.startsWith('//') ||
    path.includes('://') ||
    target.includes('://')
  ) {
    return 'Use internal Shopify paths beginning with one slash. External URLs are not allowed.';
  }
  if (path === target) return 'Source and destination cannot be the same path.';
  if (['/admin', '/cart', '/checkout', '/account'].some((prefix) => path.startsWith(prefix))) {
    return 'System, checkout, cart, and customer-account paths cannot be redirect sources.';
  }
  if (currentPaths.includes(path)) {
    return `${path} is currently a live catalog or content path. Retire or rename it before creating a redirect.`;
  }
  const existing = snapshot.redirects.find((redirect) => redirect.path === path);
  if (existing)
    return `${path} already redirects to ${existing.target}. Review the existing map instead.`;
  const targetRedirect = snapshot.redirects.find((redirect) => redirect.path === target);
  if (targetRedirect)
    return `${target} is itself a redirect source. Point directly to ${targetRedirect.target}.`;
  return null;
}

async function verifyTarget(primaryDomainUrl: string, target: string) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(`${primaryDomainUrl.replace(/\/$/, '')}${target}`, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'KlynaRedirectGuard/1.0 (+https://klyna.dev)' },
    });
    clearTimeout(timeout);
    if (!response.ok)
      return `${target} returned HTTP ${response.status}. Choose a live destination.`;
    return null;
  } catch {
    return `Klyna could not verify ${target}. Confirm the storefront is public and try again.`;
  }
}

function redirectRisks(snapshot: ShopSnapshot): RedirectRisk[] {
  const sources = new Map(snapshot.redirects.map((redirect) => [redirect.path, redirect.target]));
  const risks: RedirectRisk[] = [];
  for (const redirect of snapshot.redirects) {
    if (redirect.path === redirect.target) {
      risks.push({
        id: `self-${redirect.id}`,
        severity: 'critical',
        title: 'Self-redirect',
        detail: `${redirect.path} points to itself and can create a loop.`,
      });
    } else if (sources.has(redirect.target)) {
      risks.push({
        id: `chain-${redirect.id}`,
        severity: 'warning',
        title: 'Redirect chain',
        detail: `${redirect.path} → ${redirect.target} → ${sources.get(redirect.target)}. Point directly to the final URL.`,
      });
    }
  }
  return risks;
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(date);
}

function formatIsoDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(date);
}

function downloadWorkspace(productName: string, items: WorkspaceItem[]) {
  const rows = [
    ['Queue status', 'Priority', 'Item', 'Detail', 'Evidence', 'Next step', 'Shopify admin URL'],
    ...items.map((item) => [
      item.workflowStatus ?? 'open',
      item.tone,
      item.title,
      item.detail,
      item.evidence,
      item.action,
      item.adminUrl ?? '',
    ]),
  ];
  const csv = rows
    .map((row) => row.map((value) => `"${value.replace(/"/g, '""')}"`).join(','))
    .join('\r\n');
  const blobUrl = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = blobUrl;
  anchor.download = `${productName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-fix-queue-${new Date()
    .toISOString()
    .slice(0, 10)}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(blobUrl);
}

function downloadRedirects(redirects: { path: string; target: string }[]) {
  const rows = [
    ['Redirect from', 'Redirect to'],
    ...redirects.map((redirect) => [redirect.path, redirect.target]),
  ];
  const csv = rows
    .map((row) => row.map((value) => `"${value.replace(/"/g, '""')}"`).join(','))
    .join('\r\n');
  const blobUrl = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = blobUrl;
  anchor.download = `klyna-redirect-map-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(blobUrl);
}
