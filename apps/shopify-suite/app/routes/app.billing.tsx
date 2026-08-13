import { type ActionFunctionArgs, type LoaderFunctionArgs, json, redirect } from '@remix-run/node';
import { Form, useLoaderData, useNavigation } from '@remix-run/react';
import {
  Badge,
  Banner,
  BlockStack,
  Button,
  Card,
  InlineGrid,
  InlineStack,
  Layout,
  List,
  Page,
  Text,
} from '@shopify/polaris';
import {
  PRO_PLAN,
  getActiveBillingState,
  isGraphqlSubscriptionId,
  parseRequestedPlan,
  proPrice,
} from '../lib/billing-plans';
import { useEmbeddedRoute } from '../lib/embedded-routes';
import { getProductKey, products } from '../lib/products';
import { authenticate, isBillingTest } from '../shopify.server';

const trialDays = 7;

type AdminGraphqlClient = {
  graphql(query: string, options?: { variables?: Record<string, unknown> }): Promise<Response>;
};

type BillingCanceller = {
  cancel(input: { subscriptionId: string; isTest: boolean; prorate?: boolean }): Promise<unknown>;
};

function appAdminBillingUrl(request: Request) {
  const url = new URL(request.url);
  const shop = url.searchParams.get('shop');

  if (!shop?.endsWith('.myshopify.com')) {
    url.searchParams.delete('charge_id');
    return url.toString();
  }

  const storeHandle = shop.replace(/\.myshopify\.com$/, '');
  return `https://admin.shopify.com/store/${storeHandle}/apps/klyna-${getProductKey()}/app/billing`;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, billing } = await authenticate.admin(request);
  const product = products[getProductKey()];
  let hasActivePayment = false;
  let activePlan: string | null = null;
  let activeSubscriptionId: string | null = null;
  let activeSubscriptionName: string | null = null;
  let billingError: string | null = null;

  try {
    const billingState = await getActiveBillingState(admin, billing, isBillingTest());

    hasActivePayment = billingState.hasActivePayment;
    activeSubscriptionId = billingState.activeSubscriptionId;
    activeSubscriptionName = billingState.activeSubscriptionName;
    activePlan = billingState.activePlan;
  } catch (error) {
    console.error('Billing check failed on plan page.', error);
    billingError =
      'Shopify billing is not available for this store yet. You can still use the audit dashboard while billing is configured.';
  }

  return json({
    product,
    hasActivePayment,
    activePlan,
    activeSubscriptionId,
    activeSubscriptionName,
    billingError,
    planName: PRO_PLAN,
    price: `$${proPrice()}/month`,
    trialDays,
    isTest: isBillingTest(),
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, billing } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get('intent');

  if (intent === 'downgrade') {
    const subscriptionId = formData.get('subscriptionId');

    if (typeof subscriptionId === 'string' && subscriptionId.length > 0) {
      await cancelBillingSubscription(admin, billing, subscriptionId);
    }

    throw redirect(appAdminBillingUrl(request));
  }

  const plan = parseRequestedPlan(formData.get('plan'));

  return billing.request({
    plan,
    isTest: isBillingTest(),
    trialDays,
    returnUrl: appAdminBillingUrl(request),
  });
};

async function cancelBillingSubscription(
  admin: AdminGraphqlClient,
  billing: BillingCanceller,
  subscriptionId: string,
) {
  try {
    await billing.cancel({
      subscriptionId,
      isTest: isBillingTest(),
      prorate: true,
    });
    return;
  } catch (error) {
    if (!isGraphqlSubscriptionId(subscriptionId)) {
      throw error;
    }

    console.error('Shopify billing.cancel failed; retrying with appSubscriptionCancel.', error);
  }

  const response = await admin.graphql(
    /* GraphQL */ `
      mutation KlynaCancelAppSubscription($id: ID!) {
        appSubscriptionCancel(id: $id, prorate: true) {
          appSubscription {
            id
            status
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    { variables: { id: subscriptionId } },
  );

  const payload = (await response.json()) as {
    data?: {
      appSubscriptionCancel?: {
        userErrors?: Array<{ field?: string[] | null; message?: string | null }>;
      } | null;
    };
    errors?: unknown;
  };

  const userErrors = payload.data?.appSubscriptionCancel?.userErrors ?? [];

  if (!response.ok || payload.errors || userErrors.length > 0) {
    throw new Error(`Unable to cancel Shopify subscription: ${JSON.stringify(payload)}`);
  }
}

export default function Billing() {
  const {
    product,
    hasActivePayment,
    activePlan,
    activeSubscriptionId,
    activeSubscriptionName,
    billingError,
    planName,
    price,
    trialDays,
    isTest,
  } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state !== 'idle';
  const dashboardUrl = useEmbeddedRoute('/app');
  const proIsActive = hasActivePayment && activePlan === PRO_PLAN;

  return (
    <Page title={`${product.name} plan`} subtitle={product.listingPositioning}>
      <Layout>
        <Layout.Section>
          <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
            <Card>
              <BlockStack gap="300">
                <InlineStack gap="200" blockAlign="center">
                  <Text as="h2" variant="headingLg">
                    Free
                  </Text>
                  {!hasActivePayment ? (
                    <Badge tone="success">Current</Badge>
                  ) : (
                    <Badge>Available</Badge>
                  )}
                </InlineStack>
                <Text as="p" variant="headingMd">
                  $0
                </Text>
                <Text as="p" tone="subdued">
                  Get a useful store diagnosis before deciding whether Pro fits your workflow.
                </Text>
                <List type="bullet">
                  <List.Item>Three manual checks each month.</List.Item>
                  <List.Item>Latest score, findings, evidence, and next steps.</List.Item>
                  <List.Item>Product-specific operating guide.</List.Item>
                </List>
                {hasActivePayment && activeSubscriptionId ? (
                  <Form method="post">
                    <input type="hidden" name="intent" value="downgrade" />
                    <input type="hidden" name="subscriptionId" value={activeSubscriptionId} />
                    <Button submit loading={isSubmitting}>
                      Downgrade to Free
                    </Button>
                  </Form>
                ) : (
                  <Button url={dashboardUrl}>Open dashboard</Button>
                )}
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <InlineStack gap="200" blockAlign="center">
                  <Text as="h2" variant="headingLg">
                    {planName}
                  </Text>
                  {proIsActive ? (
                    <Badge tone="success">Active plan</Badge>
                  ) : (
                    <Badge>7-day trial</Badge>
                  )}
                  {isTest ? <Badge tone="info">Test billing</Badge> : null}
                </InlineStack>
                <Text as="p" variant="headingMd">
                  {price}
                </Text>
                <Text as="p" tone="subdued">
                  {product.paidValue}
                </Text>
                <List type="bullet">
                  {product.proFeatures.map((feature) => (
                    <List.Item key={feature}>{feature}</List.Item>
                  ))}
                </List>
                {billingError ? (
                  <Banner tone="warning">{billingError}</Banner>
                ) : proIsActive ? (
                  <Button url={dashboardUrl} variant="primary">
                    Open dashboard
                  </Button>
                ) : (
                  <Form method="post">
                    <input type="hidden" name="intent" value="upgrade" />
                    <input type="hidden" name="plan" value={PRO_PLAN} />
                    <Button submit variant="primary" loading={isSubmitting}>
                      {`Start ${trialDays}-day trial`}
                    </Button>
                  </Form>
                )}
                {activeSubscriptionName && activeSubscriptionName !== activePlan ? (
                  <Text as="p" tone="subdued">
                    Shopify returned subscription name: {activeSubscriptionName}
                  </Text>
                ) : null}
                <Text as="p" tone="subdued">
                  Billing is handled through Shopify and can be managed from the merchant admin.
                </Text>
              </BlockStack>
            </Card>
          </InlineGrid>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
