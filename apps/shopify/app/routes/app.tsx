import type { HeadersFunction, LoaderFunctionArgs } from '@remix-run/node';
import { Link, Outlet, useLoaderData, useRouteError } from '@remix-run/react';
import { boundary } from '@shopify/shopify-app-remix/server';
import { AppProvider } from '@shopify/shopify-app-remix/react';
import { NavMenu } from '@shopify/app-bridge-react';
import polarisStyles from '@shopify/polaris/build/esm/styles.css?url';
import brandStyles from '../styles/klyna-brand.css?url';
import { authenticate } from '../shopify.server';

export const links = () => [
  { rel: 'stylesheet', href: polarisStyles },
  { rel: 'stylesheet', href: brandStyles },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return { apiKey: process.env.SHOPIFY_API_KEY ?? '' };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <NavMenu>
        <Link to="/app" rel="home">Dashboard</Link>
        <Link to="/app/bulk">Bulk Audit</Link>
        <Link to="/app/audit">Page Audit</Link>
        <Link to="/app/schema">Schema Markup</Link>
        <Link to="/app/alt-text">Image Alt Text</Link>
        <Link to="/app/meta-editor">Meta Editor</Link>
        <Link to="/app/links">Internal Links</Link>
        <Link to="/app/vitals">Core Web Vitals</Link>
        <Link to="/app/keywords">Keyword Analysis</Link>
        <Link to="/app/geo">GEO Score</Link>
        <Link to="/app/canonical">Canonical Auditor</Link>
        <Link to="/app/competitor">Competitor Audit</Link>
        <Link to="/app/settings">Settings</Link>
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
