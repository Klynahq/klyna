import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/node';
import { Form, useActionData, useLoaderData, useNavigation, useSearchParams } from '@remix-run/react';
import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  EmptyState,
  InlineStack,
  Layout,
  Page,
  Tabs,
  Text,
  TextField,
  Thumbnail,
} from '@shopify/polaris';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';
import { refreshProductRating } from '../lib/reviews.server';

const TABS = [
  { id: 'pending', content: 'Pending' },
  { id: 'published', content: 'Published' },
  { id: 'rejected', content: 'Rejected' },
] as const;

type TabId = (typeof TABS)[number]['id'];

function parsePhotos(raw: string): string[] {
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as string[]) : [];
  } catch {
    return [];
  }
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const status = (url.searchParams.get('status') ?? 'pending') as TabId;

  const [reviews, counts] = await Promise.all([
    prisma.review.findMany({
      where: { shop: session.shop, status },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.review.groupBy({
      by: ['status'],
      where: { shop: session.shop },
      _count: true,
    }),
  ]);

  const byStatus: Record<string, number> = {};
  for (const c of counts) byStatus[c.status] = c._count;

  return { status, reviews, counts: byStatus };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get('intent') ?? '');
  const id = String(form.get('id') ?? '');

  const review = await prisma.review.findFirst({
    where: { id, shop: session.shop },
  });
  if (!review) {
    return json({ error: 'Review not found.' }, { status: 404 });
  }

  switch (intent) {
    case 'publish': {
      await prisma.review.update({
        where: { id: review.id },
        data: { status: 'published', publishedAt: new Date() },
      });
      // If this review came from a request link, mark the request reviewed.
      if (review.orderId) {
        await prisma.reviewRequest.updateMany({
          where: { shop: session.shop, orderId: review.orderId, productId: review.productId },
          data: { status: 'reviewed', reviewedAt: new Date() },
        });
      }
      break;
    }
    case 'reject': {
      await prisma.review.update({
        where: { id: review.id },
        data: { status: 'rejected', publishedAt: null },
      });
      break;
    }
    case 'spam': {
      await prisma.review.update({
        where: { id: review.id },
        data: { status: 'spam', publishedAt: null },
      });
      break;
    }
    case 'reply': {
      const reply = String(form.get('reply') ?? '').trim();
      await prisma.review.update({
        where: { id: review.id },
        data: { reply: reply || null },
      });
      return json({ ok: true, productId: review.productId });
    }
    default:
      return json({ error: 'Unknown action.' }, { status: 400 });
  }

  // Any status change to a published-eligible review re-aggregates the product
  // and pushes the new AggregateRating into the storefront metafield.
  const aggregate = await refreshProductRating(admin, session.shop, review.productId);
  return json({ ok: true, productId: review.productId, aggregate });
};

export default function Moderation() {
  const { status, reviews, counts } = useLoaderData<typeof loader>();
  const data = useActionData<typeof action>();
  const nav = useNavigation();
  const [, setSearchParams] = useSearchParams();
  const busy = nav.state !== 'idle';

  const selectedTab = Math.max(0, TABS.findIndex((t) => t.id === status));
  const error = data && 'error' in data ? data.error : null;

  const tabsWithCounts = TABS.map((t) => ({
    id: t.id,
    content: counts[t.id] ? `${t.content} (${counts[t.id]})` : t.content,
  }));

  return (
    <Page title="Moderation" subtitle="Approve, reply to, or reject incoming reviews" backAction={{ url: '/app' }}>
      <Layout>
        <Layout.Section>
          <Card padding="0">
            <Tabs
              tabs={tabsWithCounts}
              selected={selectedTab}
              onSelect={(i) => setSearchParams({ status: TABS[i].id })}
            >
              <Box padding="400">
                {error && (
                  <Box paddingBlockEnd="300">
                    <Text as="p" tone="critical">{String(error)}</Text>
                  </Box>
                )}
                {reviews.length === 0 ? (
                  <EmptyState
                    heading={`No ${status} reviews`}
                    image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                  >
                    <p>
                      {status === 'pending'
                        ? 'New reviews land here for approval. Reviews can also auto-publish from Settings.'
                        : `Reviews you mark as ${status} will appear here.`}
                    </p>
                  </EmptyState>
                ) : (
                  <BlockStack gap="300">
                    {reviews.map((r) => {
                      const photos = parsePhotos(r.photos);
                      return (
                        <Box
                          key={r.id}
                          padding="400"
                          borderColor="border"
                          borderWidth="025"
                          borderRadius="300"
                        >
                          <BlockStack gap="300">
                            <InlineStack align="space-between" blockAlign="start">
                              <BlockStack gap="100">
                                <InlineStack gap="200" blockAlign="center">
                                  <Text as="span" variant="headingMd" fontWeight="bold">
                                    {'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}
                                  </Text>
                                  {r.verified && <Badge tone="success" size="small">Verified buyer</Badge>}
                                  <Badge size="small">{r.source}</Badge>
                                </InlineStack>
                                <Text as="span" variant="bodySm" tone="subdued">
                                  {r.authorName}
                                  {r.authorEmail ? ` · ${r.authorEmail}` : ''} · {r.productTitle}
                                </Text>
                              </BlockStack>
                              <Text as="span" variant="bodySm" tone="subdued">
                                {new Date(r.createdAt).toLocaleDateString()}
                              </Text>
                            </InlineStack>

                            <BlockStack gap="100">
                              {r.title && <Text as="p" fontWeight="semibold">{r.title}</Text>}
                              <Text as="p" variant="bodyMd">{r.body}</Text>
                            </BlockStack>

                            {photos.length > 0 && (
                              <InlineStack gap="200">
                                {photos.map((src, i) => (
                                  <Thumbnail key={i} source={src} alt={`Review photo ${i + 1}`} size="large" />
                                ))}
                              </InlineStack>
                            )}

                            {r.reply && (
                              <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                                <Text as="p" variant="bodySm" tone="subdued">Your reply</Text>
                                <Text as="p" variant="bodyMd">{r.reply}</Text>
                              </Box>
                            )}

                            <InlineStack gap="200" wrap={false} blockAlign="center">
                              {status !== 'published' && (
                                <Form method="post">
                                  <input type="hidden" name="id" value={r.id} />
                                  <input type="hidden" name="intent" value="publish" />
                                  <Button submit variant="primary" loading={busy}>Publish</Button>
                                </Form>
                              )}
                              {status !== 'rejected' && (
                                <Form method="post">
                                  <input type="hidden" name="id" value={r.id} />
                                  <input type="hidden" name="intent" value="reject" />
                                  <Button submit loading={busy}>Reject</Button>
                                </Form>
                              )}
                              <Form method="post">
                                <input type="hidden" name="id" value={r.id} />
                                <input type="hidden" name="intent" value="spam" />
                                <Button submit tone="critical" variant="tertiary" loading={busy}>
                                  Mark spam
                                </Button>
                              </Form>
                            </InlineStack>

                            <Form method="post">
                              <input type="hidden" name="id" value={r.id} />
                              <input type="hidden" name="intent" value="reply" />
                              <InlineStack gap="200" blockAlign="end" wrap={false}>
                                <Box width="100%">
                                  <TextField
                                    label="Merchant reply"
                                    labelHidden
                                    name="reply"
                                    autoComplete="off"
                                    multiline={2}
                                    defaultValue={r.reply ?? ''}
                                    placeholder="Reply publicly to this review…"
                                  />
                                </Box>
                                <Button submit loading={busy}>Save reply</Button>
                              </InlineStack>
                            </Form>
                          </BlockStack>
                        </Box>
                      );
                    })}
                  </BlockStack>
                )}
              </Box>
            </Tabs>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
