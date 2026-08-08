import { type HeadersFunction, type LoaderFunctionArgs, json, redirect } from '@remix-run/node';
import { Link, Outlet, useLoaderData, useRouteError } from '@remix-run/react';
import { NavMenu } from '@shopify/app-bridge-react';
import polarisStyles from '@shopify/polaris/build/esm/styles.css?url';
import { AppProvider } from '@shopify/shopify-app-remix/react';
import { boundary } from '@shopify/shopify-app-remix/server';
import { useEmbeddedRoute } from '../lib/embedded-routes';
import { getProductKey, products } from '../lib/products';
import {
  BILLING_PLAN_NAMES,
  authenticate,
  isBillingRequired,
  isBillingTest,
} from '../shopify.server';
import suiteStyles from '../styles/klyna-suite.css?url';

export const links = () => [
  { rel: 'stylesheet', href: polarisStyles },
  { rel: 'stylesheet', href: suiteStyles },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing } = await authenticate.admin(request);
  const url = new URL(request.url);

  if (isBillingRequired() && !url.pathname.endsWith('/app/billing')) {
    try {
      const { hasActivePayment } = await billing.check({
        plans: [...BILLING_PLAN_NAMES],
        isTest: isBillingTest(),
      });

      if (!hasActivePayment) {
        throw redirect(`/app/billing${url.search}`);
      }
    } catch (error) {
      if (error instanceof Response) {
        throw error;
      }

      console.error('Billing check failed; continuing without blocking app load.', error);
    }
  }

  return json({ apiKey: process.env.SHOPIFY_API_KEY ?? '', product: products[getProductKey()] });
};

export default function App() {
  const { apiKey, product } = useLoaderData<typeof loader>();
  const dashboardUrl = useEmbeddedRoute('/app');
  const historyUrl = useEmbeddedRoute('/app/history');
  const playbookUrl = useEmbeddedRoute('/app/playbook');
  const billingUrl = useEmbeddedRoute('/app/billing');
  const workspaceLabel = product.key === 'redirect-guard' ? 'Fix playbook' : 'Operating guide';

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <NavMenu>
        <Link to={dashboardUrl} rel="home">
          {product.shortName}
        </Link>
        <Link to={historyUrl}>Scan history</Link>
        <Link to={playbookUrl}>{workspaceLabel}</Link>
        <Link to={billingUrl}>Plan</Link>
      </NavMenu>
      <Outlet />
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
