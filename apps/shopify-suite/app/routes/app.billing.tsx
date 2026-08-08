import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/node';
import { Form, useLoaderData, useNavigation } from '@remix-run/react';
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  InlineGrid,
  InlineStack,
  Layout,
  List,
  Page,
  RadioButton,
  Text,
} from '@shopify/polaris';
import {
  PRO_PLAN,
  normalizeBillingPlanName,
  parseRequestedPlan,
  publicBillingPlans,
} from '../lib/billing-plans';
import { useEmbeddedRoute } from '../lib/embedded-routes';
import { getProductKey, products } from '../lib/products';
import { BILLING_PLAN_NAMES, authenticate, isBillingTest } from '../shopify.server';

const trialDays = 7;

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
  const { billing } = await authenticate.admin(request);
  const product = products[getProductKey()];
  let hasActivePayment = false;
  let activePlan: string | null = null;
  let activeSubscriptionName: string | null = null;
  let billingError: string | null = null;

  try {
    const billingCheck = await billing.check({
      plans: [...BILLING_PLAN_NAMES],
      isTest: isBillingTest(),
    });
    hasActivePayment = billingCheck.hasActivePayment;
    const activeSubscriptions = [...billingCheck.appSubscriptions].sort(
      (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
    );
    const activeSubscription =
      activeSubscriptions.find(
        (subscription) => normalizeBillingPlanName(subscription.name) === PRO_PLAN,
      ) ?? activeSubscriptions[0];
    activeSubscriptionName = activeSubscription?.name ?? null;
    activePlan = normalizeBillingPlanName(activeSubscriptionName);
  } catch (error) {
    console.error('Billing check failed on plan page.', error);
    billingError =
      'Shopify billing is not available for this store yet. You can still use the audit dashboard while billing is configured.';
  }

  return json({
    product,
    hasActivePayment,
    activePlan,
    activeSubscriptionName,
    billingError,
    plans: publicBillingPlans(),
    trialDays,
    isTest: isBillingTest(),
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { billing } = await authenticate.admin(request);
  const formData = await request.formData();
  const plan = parseRequestedPlan(formData.get('plan'));

  return billing.request({
    plan,
    isTest: isBillingTest(),
    trialDays,
    returnUrl: appAdminBillingUrl(request),
  });
};

export default function Billing() {
  const {
    product,
    hasActivePayment,
    activePlan,
    activeSubscriptionName,
    billingError,
    plans,
    trialDays,
    isTest,
  } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state !== 'idle';
  const dashboardUrl = useEmbeddedRoute('/app');

  return (
    <Page title={`${product.name} plan`} subtitle={product.listingPositioning}>
      <Layout>
        <Layout.Section>
          <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
            {plans.map((plan) => {
              const isActive = activePlan === plan.name;

              return (
                <Card key={plan.name}>
                  <BlockStack gap="300">
                    <InlineStack gap="200" blockAlign="center">
                      <Text as="h2" variant="headingLg">
                        {plan.name}
                      </Text>
                      {isActive ? <Badge tone="success">Active plan</Badge> : null}
                      {!hasActivePayment ? <Badge>Available</Badge> : null}
                      {isTest ? <Badge tone="info">Test billing</Badge> : null}
                    </InlineStack>
                    <Text as="p" variant="headingMd">
                      {plan.priceLabel}
                    </Text>
                    <Text as="p" tone="subdued">
                      {plan.summary} Start with a {trialDays}-day trial.
                    </Text>
                    <List type="bullet">
                      {plan.features.map((feature) => (
                        <List.Item key={feature}>{feature}</List.Item>
                      ))}
                    </List>
                    {billingError ? (
                      <>
                        <Banner tone="warning">{billingError}</Banner>
                        <Button url={dashboardUrl} variant="primary">
                          Open dashboard
                        </Button>
                      </>
                    ) : isActive ? (
                      <Button url={dashboardUrl} variant="primary">
                        Open dashboard
                      </Button>
                    ) : (
                      <Form method="post">
                        <input type="hidden" name="plan" value={plan.name} />
                        <Button
                          submit
                          variant={plan.name === 'Pro' ? 'primary' : 'secondary'}
                          loading={isSubmitting}
                        >
                          {hasActivePayment ? `Switch to ${plan.name}` : plan.cta}
                        </Button>
                      </Form>
                    )}
                  </BlockStack>
                </Card>
              );
            })}

            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Current subscription
                </Text>
                <RadioButton
                  label={activePlan ? `${activePlan} is active` : 'No active paid plan yet'}
                  checked={hasActivePayment}
                  disabled
                />
                {activeSubscriptionName && activeSubscriptionName !== activePlan ? (
                  <Text as="p" tone="subdued">
                    Shopify returned subscription name: {activeSubscriptionName}
                  </Text>
                ) : null}
                <Text as="p" tone="subdued">
                  {product.paidValue}
                </Text>
                <Box paddingBlockStart="200">
                  <Text as="p" tone="subdued">
                    Billing is handled through Shopify, so merchants can manage subscription changes
                    from their admin.
                  </Text>
                </Box>
              </BlockStack>
            </Card>
          </InlineGrid>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
