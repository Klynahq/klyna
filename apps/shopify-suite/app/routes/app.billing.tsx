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
  Text,
} from '@shopify/polaris';
import { useEmbeddedRoute } from '../lib/embedded-routes';
import { getProductKey, products } from '../lib/products';
import { STARTER_PLAN, authenticate, isBillingTest } from '../shopify.server';

const trialDays = 7;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing } = await authenticate.admin(request);
  const product = products[getProductKey()];
  let hasActivePayment = false;
  let billingError: string | null = null;

  try {
    const billingCheck = await billing.check({
      plans: [STARTER_PLAN],
      isTest: isBillingTest(),
    });
    hasActivePayment = billingCheck.hasActivePayment;
  } catch (error) {
    console.error('Billing check failed on plan page.', error);
    billingError =
      'Shopify billing is not available for this store yet. You can still use the audit dashboard while billing is configured.';
  }

  return json({
    product,
    hasActivePayment,
    billingError,
    planName: 'Starter',
    price: '$9/month',
    trialDays,
    isTest: isBillingTest(),
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { billing } = await authenticate.admin(request);

  return billing.request({
    plan: STARTER_PLAN,
    isTest: isBillingTest(),
    trialDays,
  });
};

export default function Billing() {
  const { product, hasActivePayment, billingError, planName, price, trialDays, isTest } =
    useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state !== 'idle';
  const dashboardUrl = useEmbeddedRoute('/app');

  return (
    <Page title={`${product.name} plan`} subtitle={product.listingPositioning}>
      <Layout>
        <Layout.Section>
          <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
            <Card>
              <BlockStack gap="300">
                <InlineStack gap="200" blockAlign="center">
                  <Text as="h2" variant="headingLg">
                    {planName}
                  </Text>
                  {hasActivePayment ? <Badge tone="success">Active</Badge> : <Badge>Required</Badge>}
                  {isTest ? <Badge tone="info">Test billing</Badge> : null}
                </InlineStack>
                <Text as="p" variant="headingMd">
                  {price}
                </Text>
                <Text as="p" tone="subdued">
                  Start with a {trialDays}-day trial. The plan unlocks the redirect audit
                  dashboard, saved scan history, and fix playbook for launch and migration QA.
                </Text>
                {billingError ? (
                  <>
                    <Banner tone="warning">{billingError}</Banner>
                    <Button url={dashboardUrl} variant="primary">
                      Open dashboard
                    </Button>
                  </>
                ) : hasActivePayment ? (
                  <Button url={dashboardUrl} variant="primary">
                    Open dashboard
                  </Button>
                ) : (
                  <Form method="post">
                    <Button submit variant="primary" loading={isSubmitting}>
                      {`Start ${trialDays}-day trial`}
                    </Button>
                  </Form>
                )}
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Included
                </Text>
                <List type="bullet">
                  <List.Item>Redirect coverage audits for products, collections, and pages.</List.Item>
                  <List.Item>Failed sampled URL checks before catalog or theme launches.</List.Item>
                  <List.Item>Saved scan history for store teams and agencies.</List.Item>
                  <List.Item>Fix playbook for safe URL cleanup and migration QA.</List.Item>
                </List>
                <Box paddingBlockStart="200">
                  <Text as="p" tone="subdued">
                    Billing is handled through Shopify, so merchants can manage subscription
                    changes from their admin.
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
