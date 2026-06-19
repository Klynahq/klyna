import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/node';
import { useFetcher, useLoaderData } from '@remix-run/react';
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
  Page,
  ProgressBar,
  Spinner,
  Text,
  TextField,
} from '@shopify/polaris';
import { useState } from 'react';
import { authenticate } from '../shopify.server';

// ── Types from PageSpeed Insights API ─────────────────────────────────────────

type PsiAudit = {
  displayValue?: string;
  score?: number | null;
  numericValue?: number;
  details?: {
    items?: PsiAuditItem[];
  };
};

type PsiAuditItem = {
  url?: string;
  entity?: string;
  label?: string;
  totalBytes?: number;
  wastedBytes?: number;
  wastedMs?: number;
  blockingTime?: number;
  size?: number;
};

type PsiResponse = {
  lighthouseResult?: {
    categories: { performance?: { score: number } };
    audits: Record<string, PsiAudit>;
    finalDisplayedUrl?: string;
  };
  loadingExperience?: {
    metrics?: Record<string, { percentile: number; category: 'FAST' | 'AVERAGE' | 'SLOW' }>;
    overall_category?: string;
  };
  error?: { message: string };
};

type VitalsResult = {
  url: string;
  strategy: 'mobile' | 'desktop';
  perfScore: number;
  lcp: string | null;
  cls: string | null;
  fcp: string | null;
  tbt: string | null;
  si: string | null;
  lcpScore: number | null;
  clsScore: number | null;
  renderBlocking: { url: string; wastedMs: number }[];
  unusedJs: { url: string; wastedBytes: number }[];
  unusedCss: { url: string; wastedBytes: number }[];
  thirdParty: { entity: string; blockingTime: number; size: number }[];
  fieldLcp: { value: number; category: string } | null;
  fieldCls: { value: number; category: string } | null;
};

const PSI_URL = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

function normalizeHttpUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.href;
  } catch {
    return null;
  }
}

async function fetchPageSpeed(url: string, strategy: 'mobile' | 'desktop'): Promise<PsiResponse> {
  const res = await fetch(`${PSI_URL}?url=${encodeURIComponent(url)}&strategy=${strategy}`, {
    signal: AbortSignal.timeout(45_000),
  });
  const data = (await res.json().catch(() => null)) as PsiResponse | null;

  if (!res.ok) {
    return { error: { message: data?.error?.message ?? `PageSpeed returned HTTP ${res.status}` } };
  }

  return data ?? { error: { message: 'PageSpeed returned an empty response' } };
}

function parsePsi(
  data: PsiResponse,
  url: string,
  strategy: 'mobile' | 'desktop',
): VitalsResult | null {
  if (!data.lighthouseResult) return null;
  const { audits, categories } = data.lighthouseResult;
  const perfScore = Math.round((categories.performance?.score ?? 0) * 100);

  const get = (key: string): PsiAudit => audits[key] ?? {};

  const lcp = get('largest-contentful-paint').displayValue ?? null;
  const cls = get('cumulative-layout-shift').displayValue ?? null;
  const fcp = get('first-contentful-paint').displayValue ?? null;
  const tbt = get('total-blocking-time').displayValue ?? null;
  const si = get('speed-index').displayValue ?? null;
  const lcpScore = get('largest-contentful-paint').score ?? null;
  const clsScore = get('cumulative-layout-shift').score ?? null;

  const renderBlocking = (get('render-blocking-resources').details?.items ?? [])
    .map((i) => ({ url: String(i.url ?? ''), wastedMs: i.wastedMs ?? 0 }))
    .filter((i) => i.url)
    .slice(0, 8);

  const unusedJs = (get('unused-javascript').details?.items ?? [])
    .map((i) => ({ url: String(i.url ?? ''), wastedBytes: i.wastedBytes ?? 0 }))
    .filter((i) => i.url)
    .slice(0, 8);

  const unusedCss = (get('unused-css-rules').details?.items ?? [])
    .map((i) => ({ url: String(i.url ?? ''), wastedBytes: i.wastedBytes ?? 0 }))
    .filter((i) => i.url)
    .slice(0, 8);

  const thirdParty = (get('third-party-summary').details?.items ?? [])
    .map((i) => ({
      entity: String(i.entity ?? i.label ?? ''),
      blockingTime: i.blockingTime ?? 0,
      size: i.size ?? i.totalBytes ?? 0,
    }))
    .filter((i) => i.entity)
    .slice(0, 10);

  const metrics = data.loadingExperience?.metrics ?? {};
  const fieldLcp = metrics.LARGEST_CONTENTFUL_PAINT_MS
    ? {
        value: metrics.LARGEST_CONTENTFUL_PAINT_MS!.percentile,
        category: metrics.LARGEST_CONTENTFUL_PAINT_MS!.category,
      }
    : null;
  const fieldCls = metrics.CUMULATIVE_LAYOUT_SHIFT_SCORE
    ? {
        value: metrics.CUMULATIVE_LAYOUT_SHIFT_SCORE!.percentile,
        category: metrics.CUMULATIVE_LAYOUT_SHIFT_SCORE!.category,
      }
    : null;

  return {
    url,
    strategy,
    perfScore,
    lcp,
    cls,
    fcp,
    tbt,
    si,
    lcpScore,
    clsScore,
    renderBlocking,
    unusedJs,
    unusedCss,
    thirdParty,
    fieldLcp,
    fieldCls,
  };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  type ShopRes = { data: { shop: { primaryDomain: { url: string } } } };
  const shopRes = await admin.graphql('{ shop { primaryDomain { url } } }');
  const storeUrl = ((await shopRes.json()) as ShopRes).data.shop.primaryDomain.url.replace(
    /\/$/,
    '',
  );
  return json({ storeUrl });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.admin(request);
  const form = await request.formData();
  const rawUrl = String(form.get('url') ?? '').trim();
  const url = normalizeHttpUrl(rawUrl);

  if (!rawUrl) return json({ error: 'URL is required' }, { status: 400 });
  if (!url) return json({ error: 'Enter a valid http or https URL' }, { status: 400 });

  try {
    const [mobileData, desktopData] = await Promise.all([
      fetchPageSpeed(url, 'mobile'),
      fetchPageSpeed(url, 'desktop'),
    ]);

    if (mobileData.error || desktopData.error) {
      return json(
        {
          error:
            mobileData.error?.message ?? desktopData.error?.message ?? 'PageSpeed analysis failed',
        },
        { status: 400 },
      );
    }

    const mobile = parsePsi(mobileData, url, 'mobile');
    const desktop = parsePsi(desktopData, url, 'desktop');
    if (!mobile || !desktop) {
      return json(
        { error: 'PageSpeed did not return Lighthouse data for this URL' },
        { status: 400 },
      );
    }

    return json({ mobile, desktop });
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : 'Failed to fetch PageSpeed data' },
      { status: 500 },
    );
  }
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function scoreTone(score: number | null): 'success' | 'warning' | 'critical' {
  if (score === null) return 'critical';
  if (score >= 0.9) return 'success';
  if (score >= 0.5) return 'warning';
  return 'critical';
}

function perfTone(score: number): 'success' | 'warning' | 'critical' {
  if (score >= 90) return 'success';
  if (score >= 50) return 'warning';
  return 'critical';
}

function fieldTone(cat: string): 'success' | 'warning' | 'critical' {
  if (cat === 'FAST') return 'success';
  if (cat === 'AVERAGE') return 'warning';
  return 'critical';
}

function kb(bytes: number) {
  return `${Math.round(bytes / 1024)} KB`;
}

function ms(v: number) {
  return v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${v}ms`;
}

function ScoreGauge({ score, label }: { score: number; label: string }) {
  const tone = perfTone(score);
  return (
    <BlockStack gap="100" inlineAlign="center">
      <Box
        background={
          tone === 'success'
            ? 'bg-fill-success'
            : tone === 'warning'
              ? 'bg-fill-caution'
              : 'bg-fill-critical'
        }
        borderRadius="full"
        padding="400"
      >
        <Text
          as="p"
          variant="heading2xl"
          fontWeight="bold"
          tone={tone === 'success' ? 'success' : tone === 'warning' ? 'caution' : 'critical'}
        >
          {score}
        </Text>
      </Box>
      <Text as="p" variant="bodySm" tone="subdued">
        {label}
      </Text>
    </BlockStack>
  );
}

function MetricRow({
  label,
  value,
  score,
  field,
}: {
  label: string;
  value: string | null;
  score: number | null;
  field?: { value: number; category: string } | null;
}) {
  const lab = scoreTone(score);
  return (
    <InlineStack align="space-between" blockAlign="center">
      <Text as="p" variant="bodyMd">
        {label}
      </Text>
      <InlineStack gap="200" blockAlign="center">
        {field && (
          <Badge tone={fieldTone(field.category)} size="small">
            {`Field: ${field.category}`}
          </Badge>
        )}
        {value && <Badge tone={lab}>{value}</Badge>}
        {score !== null && (
          <Box minWidth="80px">
            <ProgressBar
              progress={Math.round(score * 100)}
              tone={lab === 'success' ? 'primary' : lab === 'warning' ? 'highlight' : 'critical'}
              size="small"
            />
          </Box>
        )}
      </InlineStack>
    </InlineStack>
  );
}

function VitalsCard({ result }: { result: VitalsResult }) {
  return (
    <BlockStack gap="400">
      <InlineStack align="space-between" blockAlign="center">
        <Text as="h3" variant="headingMd">
          {result.strategy === 'mobile' ? '📱 Mobile' : '🖥 Desktop'}
        </Text>
        <Badge
          tone={perfTone(result.perfScore)}
          size="large"
        >{`Performance: ${result.perfScore}`}</Badge>
      </InlineStack>

      <BlockStack gap="200">
        <Text as="h4" variant="headingSm">
          Core Web Vitals
        </Text>
        <MetricRow
          label="Largest Contentful Paint (LCP)"
          value={result.lcp}
          score={result.lcpScore}
          field={result.fieldLcp}
        />
        <MetricRow
          label="Cumulative Layout Shift (CLS)"
          value={result.cls}
          score={result.clsScore}
          field={result.fieldCls}
        />
        <MetricRow label="First Contentful Paint (FCP)" value={result.fcp} score={null} />
        <MetricRow label="Total Blocking Time (TBT)" value={result.tbt} score={null} />
        <MetricRow label="Speed Index" value={result.si} score={null} />
      </BlockStack>

      {result.thirdParty.length > 0 && (
        <>
          <Divider />
          <BlockStack gap="200">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h4" variant="headingSm">
                Third-party script impact
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Shopify apps often cause this
              </Text>
            </InlineStack>
            {result.thirdParty.map((t, i) => (
              <InlineStack key={String(i)} align="space-between" blockAlign="center">
                <Text as="p" variant="bodyMd">
                  {t.entity}
                </Text>
                <InlineStack gap="200">
                  {t.blockingTime > 0 && (
                    <Badge
                      tone={t.blockingTime > 250 ? 'critical' : 'warning'}
                    >{`${ms(t.blockingTime)} blocking`}</Badge>
                  )}
                  <Text as="p" variant="bodySm" tone="subdued">
                    {kb(t.size)}
                  </Text>
                </InlineStack>
              </InlineStack>
            ))}
          </BlockStack>
        </>
      )}

      {result.renderBlocking.length > 0 && (
        <>
          <Divider />
          <BlockStack gap="200">
            <Text as="h4" variant="headingSm">
              Render-blocking resources
            </Text>
            {result.renderBlocking.slice(0, 5).map((r, i) => (
              <InlineStack key={String(i)} align="space-between" blockAlign="center">
                <Text as="p" variant="bodySm" breakWord>
                  {r.url.replace(/^https?:\/\/[^/]+/, '').slice(0, 60)}
                </Text>
                <Badge tone="warning">{`+${ms(r.wastedMs)}`}</Badge>
              </InlineStack>
            ))}
          </BlockStack>
        </>
      )}

      {(result.unusedJs.length > 0 || result.unusedCss.length > 0) && (
        <>
          <Divider />
          <BlockStack gap="200">
            <Text as="h4" variant="headingSm">
              Unused code (savings)
            </Text>
            {[...result.unusedJs, ...result.unusedCss].slice(0, 6).map((r, i) => (
              <InlineStack key={String(i)} align="space-between" blockAlign="center">
                <Text as="p" variant="bodySm" breakWord>
                  {r.url.replace(/^https?:\/\/[^/]+/, '').slice(0, 60)}
                </Text>
                <Badge>{`-${kb(r.wastedBytes)}`}</Badge>
              </InlineStack>
            ))}
          </BlockStack>
        </>
      )}
    </BlockStack>
  );
}

export default function VitalsPage() {
  const { storeUrl } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<{ mobile?: VitalsResult; desktop?: VitalsResult; error?: string }>();
  const [url, setUrl] = useState(storeUrl);

  const loading = fetcher.state === 'submitting';
  const result = fetcher.data;

  return (
    <Page title="Core Web Vitals" backAction={{ url: '/app' }}>
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <BlockStack gap="100">
                <Text as="h2" variant="headingMd">
                  Google PageSpeed Insights
                </Text>
                <Text as="p" tone="subdued">
                  Powered by the free Google PageSpeed Insights API — no key required. Returns real
                  Lighthouse scores + field data from Chrome UX Report. Run it on your homepage,
                  best-selling product, or slowest collection.
                </Text>
              </BlockStack>
              <fetcher.Form method="post">
                <InlineStack gap="200" blockAlign="end">
                  <Box minWidth="400px">
                    <TextField
                      label="Page URL"
                      value={url}
                      onChange={setUrl}
                      name="url"
                      autoComplete="off"
                      type="url"
                    />
                  </Box>
                  <Button submit variant="primary" loading={loading}>
                    Analyze
                  </Button>
                </InlineStack>
              </fetcher.Form>
            </BlockStack>
          </Card>
        </Layout.Section>

        {loading && (
          <Layout.Section>
            <Card>
              <InlineStack gap="300" blockAlign="center">
                <Spinner size="small" />
                <Text as="p" tone="subdued">
                  Running Lighthouse audit on mobile + desktop simultaneously…
                </Text>
              </InlineStack>
            </Card>
          </Layout.Section>
        )}

        {result?.error && (
          <Layout.Section>
            <Banner tone="critical" title="Analysis failed">
              <Text as="p" variant="bodyMd">
                {result.error}
              </Text>
            </Banner>
          </Layout.Section>
        )}

        {result?.mobile && result?.desktop && !loading && (
          <>
            {/* Score at a glance */}
            <Layout.Section>
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">
                    Performance at a glance
                  </Text>
                  <InlineGrid columns={2} gap="600">
                    <ScoreGauge score={result.mobile.perfScore} label="Mobile" />
                    <ScoreGauge score={result.desktop.perfScore} label="Desktop" />
                  </InlineGrid>
                  <Banner
                    tone={
                      result.mobile.perfScore >= 90
                        ? 'success'
                        : result.mobile.perfScore >= 50
                          ? 'warning'
                          : 'critical'
                    }
                    title={
                      result.mobile.perfScore >= 90
                        ? 'Excellent performance'
                        : result.mobile.perfScore >= 50
                          ? 'Room for improvement'
                          : 'Performance is hurting your SEO'
                    }
                  >
                    <Text as="p" variant="bodyMd">
                      {result.mobile.perfScore < 50
                        ? 'Google uses page speed as a ranking signal. A score below 50 on mobile is actively hurting your rankings. Check the third-party scripts section — Shopify apps are often the culprit.'
                        : result.mobile.perfScore < 90
                          ? 'Your store is loading reasonably well but there are specific improvements below that could push you into the green zone.'
                          : 'Your store loads fast. Keep monitoring after installing new apps — each one adds JavaScript that slows your storefront.'}
                    </Text>
                  </Banner>
                </BlockStack>
              </Card>
            </Layout.Section>

            {/* Mobile + Desktop detail */}
            <Layout.Section>
              <InlineGrid columns={2} gap="300">
                <Card>
                  <VitalsCard result={result.mobile} />
                </Card>
                <Card>
                  <VitalsCard result={result.desktop} />
                </Card>
              </InlineGrid>
            </Layout.Section>

            {/* What to do */}
            <Layout.Section>
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">
                    What to fix first
                  </Text>
                  <BlockStack gap="200">
                    {result.mobile.thirdParty.filter((t) => t.blockingTime > 200).length > 0 && (
                      <InlineStack align="space-between" blockAlign="center">
                        <BlockStack gap="050">
                          <Text as="p" variant="bodyMd" fontWeight="semibold">
                            Slow third-party scripts
                          </Text>
                          <Text as="p" variant="bodySm" tone="subdued">
                            {result.mobile.thirdParty
                              .filter((t) => t.blockingTime > 200)
                              .map((t) => t.entity)
                              .join(', ')}{' '}
                            — consider removing unused apps
                          </Text>
                        </BlockStack>
                        <Badge tone="critical">High impact</Badge>
                      </InlineStack>
                    )}
                    {result.mobile.renderBlocking.length > 0 && (
                      <InlineStack align="space-between" blockAlign="center">
                        <BlockStack gap="050">
                          <Text as="p" variant="bodyMd" fontWeight="semibold">
                            Render-blocking resources
                          </Text>
                          <Text as="p" variant="bodySm" tone="subdued">
                            {result.mobile.renderBlocking.length} resources delay first paint. Defer
                            or inline critical CSS.
                          </Text>
                        </BlockStack>
                        <Badge tone="warning">Medium impact</Badge>
                      </InlineStack>
                    )}
                    {result.mobile.unusedJs.length + result.mobile.unusedCss.length > 0 && (
                      <InlineStack align="space-between" blockAlign="center">
                        <BlockStack gap="050">
                          <Text as="p" variant="bodyMd" fontWeight="semibold">
                            Unused JavaScript + CSS
                          </Text>
                          <Text as="p" variant="bodySm" tone="subdued">
                            {result.mobile.unusedJs.length + result.mobile.unusedCss.length} files
                            with unused code. Remove or lazy-load.
                          </Text>
                        </BlockStack>
                        <Badge tone="warning">Medium impact</Badge>
                      </InlineStack>
                    )}
                    {(result.mobile.lcpScore ?? 0) < 0.5 && (
                      <InlineStack align="space-between" blockAlign="center">
                        <BlockStack gap="050">
                          <Text as="p" variant="bodyMd" fontWeight="semibold">
                            Slow LCP — hero image
                          </Text>
                          <Text as="p" variant="bodySm" tone="subdued">
                            LCP {result.mobile.lcp} is below Google&apos;s 2.5s threshold. Optimize
                            your hero image (WebP, preload, lazy-load below-fold images).
                          </Text>
                        </BlockStack>
                        <Badge tone="critical">High impact</Badge>
                      </InlineStack>
                    )}
                  </BlockStack>
                </BlockStack>
              </Card>
            </Layout.Section>
          </>
        )}
      </Layout>
    </Page>
  );
}
