import adminStyles from '@klyna/ui/shopify-admin.css?url';
import { type HeadersFunction, type LoaderFunctionArgs, json } from '@remix-run/node';
import { Link, Outlet, useLoaderData, useRouteError } from '@remix-run/react';
import { NavMenu } from '@shopify/app-bridge-react';
import polarisStyles from '@shopify/polaris/build/esm/styles.css?url';
import { AppProvider } from '@shopify/shopify-app-remix/react';
import { boundary } from '@shopify/shopify-app-remix/server';
import { useEmbeddedRoute } from '../lib/embedded-routes';
import { getProductKey, products } from '../lib/products';
import { authenticate } from '../shopify.server';

export const links = () => [
  { rel: 'stylesheet', href: polarisStyles },
  { rel: 'stylesheet', href: adminStyles },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  return json({ apiKey: process.env.SHOPIFY_API_KEY ?? '', product: products[getProductKey()] });
};

export default function App() {
  const { apiKey, product } = useLoaderData<typeof loader>();
  const dashboardUrl = useEmbeddedRoute('/app');
  const historyUrl = useEmbeddedRoute('/app/history');
  const playbookUrl = useEmbeddedRoute('/app/playbook');
  const billingUrl = useEmbeddedRoute('/app/billing');
  const workspaceLabel =
    product.key === 'redirect-guard' ? 'Redirect workspace' : 'Operating guide';

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
      <div className="KlynaAdmin">
        <Outlet />
      </div>
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
