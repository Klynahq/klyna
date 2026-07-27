import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/node';
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
  Divider,
  InlineGrid,
  InlineStack,
  Layout,
  List,
  Page,
  Text,
} from '@shopify/polaris';
import { useEffect } from 'react';
import prisma from '../db.server';
import { getProductKey, products } from '../lib/products';
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

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const productKey = getProductKey();
  const product = products[productKey];

  if (productKey !== 'redirect-guard') {
    return json({
      mode: 'guide' as const,
      product,
      steps: guideSteps[productKey as keyof typeof guideSteps] ?? [],
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
  if (getProductKey() !== 'redirect-guard') {
    return json({ error: 'Redirect actions are only available in Redirect Guard.' }, { status: 400 });
  }

  const form = await request.formData();
  const intent = String(form.get('intent') ?? '');
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
  if (data.mode === 'guide') return <Guide product={data.product} steps={data.steps} />;
  return <RedirectWorkspace data={data} />;
}

function RedirectWorkspace({ data }: { data: Extract<ReturnType<typeof useLoaderData<typeof loader>>, { mode: 'redirect' }> }) {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const isSubmitting = navigation.state !== 'idle';

  useEffect(() => {
    if (actionData && ('created' in actionData || 'baselineSaved' in actionData)) {
      void revalidator.revalidate();
    }
  }, [actionData, revalidator]);

  return (
    <Page
      title="Redirect Guard fix playbook"
      subtitle="Detect URL losses, validate destinations, and create reviewed Shopify redirects."
      primaryAction={{ content: 'Export redirect map', onAction: () => downloadRedirects(data.redirects) }}
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
                  <label style={{ display: 'grid', gap: '6px' }}>
                    <Text as="span" fontWeight="semibold">
                      Retired source path
                    </Text>
                    <input
                      type="text"
                      name="path"
                      required
                      placeholder="/products/old-handle"
                      autoComplete="off"
                      style={{
                        border: '1px solid #8a8a8a',
                        borderRadius: '8px',
                        fontSize: '14px',
                        padding: '10px 12px',
                        width: '100%',
                      }}
                    />
                    <Text as="span" tone="subdued">
                      Path on {data.primaryDomainUrl}
                    </Text>
                  </label>
                  <label style={{ display: 'grid', gap: '6px' }}>
                    <Text as="span" fontWeight="semibold">
                      Live destination path
                    </Text>
                    <input
                      type="text"
                      name="target"
                      required
                      placeholder="/"
                      autoComplete="off"
                      style={{
                        border: '1px solid #8a8a8a',
                        borderRadius: '8px',
                        fontSize: '14px',
                        padding: '10px 12px',
                        width: '100%',
                      }}
                    />
                    <Text as="span" tone="subdued">
                      Use / to test safely against the storefront home page.
                    </Text>
                  </label>
                  <label
                    style={{
                      alignItems: 'center',
                      cursor: 'pointer',
                      display: 'flex',
                      gap: '8px',
                    }}
                  >
                    <input
                      type="checkbox"
                      name="confirmed"
                      value="yes"
                      required
                      style={{ height: '18px', width: '18px' }}
                    />
                    <Text as="span">I reviewed this source and destination</Text>
                  </label>
                  <InlineStack gap="200" blockAlign="center">
                    <Button
                      submit
                      variant="primary"
                      loading={isSubmitting}
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
                      Save today&apos;s live catalog and content paths. Future checks flag paths that
                      disappear without redirect coverage.
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
                            onClick={() => void navigator.clipboard.writeText(removedPath)}
                          >
                            Copy path
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
                    Current Shopify redirects. Export the full map before a migration or catalog cleanup.
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

function Guide({ product, steps }: { product: (typeof products)[keyof typeof products]; steps: string[] }) {
  return (
    <Page title={`${product.name} operating guide`} subtitle={product.listingPositioning}>
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">
                Safe operating rules
              </Text>
              <List type="bullet">
                {steps.map((step) => (
                  <List.Item key={step}>{step}</List.Item>
                ))}
              </List>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'success' | 'warning' | 'critical' }) {
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
    ...snapshot.products.map((item) => ({ type: 'Product', title: item.title, path: urlPath(item.onlineStoreUrl) })),
    ...snapshot.collections.map((item) => ({ type: 'Collection', title: item.title, path: urlPath(item.onlineStoreUrl) })),
    ...snapshot.pages.map((item) => ({ type: 'Page', title: item.title, path: urlPath(item.onlineStoreUrl) })),
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
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
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

function validateRedirect(path: string, target: string, currentPaths: string[], snapshot: ShopSnapshot) {
  if (!path || !target) return 'Enter both a retired source path and a live destination path.';
  if (path.startsWith('//') || target.startsWith('//') || path.includes('://') || target.includes('://')) {
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
  if (existing) return `${path} already redirects to ${existing.target}. Review the existing map instead.`;
  const targetRedirect = snapshot.redirects.find((redirect) => redirect.path === target);
  if (targetRedirect) return `${target} is itself a redirect source. Point directly to ${targetRedirect.target}.`;
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
    if (!response.ok) return `${target} returned HTTP ${response.status}. Choose a live destination.`;
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
