import adminStyles from '@klyna/ui/shopify-admin.css?url';
import type { HeadersFunction, LoaderFunctionArgs } from '@remix-run/node';
import { Link, Outlet, useLoaderData, useRouteError } from '@remix-run/react';
import { NavMenu } from '@shopify/app-bridge-react';
import polarisStyles from '@shopify/polaris/build/esm/styles.css?url';
import { AppProvider } from '@shopify/shopify-app-remix/react';
import { boundary } from '@shopify/shopify-app-remix/server';
import { useEmbeddedRoute } from '../lib/embedded-routes';
import { getShopPlan } from '../lib/plans.server';
import { authenticate } from '../shopify.server';

export const links = () => [
  { rel: 'stylesheet', href: polarisStyles },
  { rel: 'stylesheet', href: adminStyles },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  await getShopPlan(session.shop, request);
  return { apiKey: process.env.SHOPIFY_API_KEY ?? '' };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();
  const embeddedRoute = useEmbeddedRoute();

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <NavMenu>
        <Link to={embeddedRoute('/app')} rel="home">
          Dashboard
        </Link>
        <Link to={embeddedRoute('/app/bundles')}>Bundles</Link>
        <Link to={embeddedRoute('/app/volume')}>Volume discounts</Link>
        <Link to={embeddedRoute('/app/settings')}>Settings</Link>
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
