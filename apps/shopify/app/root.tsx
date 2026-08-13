import { type LoaderFunctionArgs, json } from '@remix-run/node';
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
  useMatches,
} from '@remix-run/react';

export const loader = async (_args: LoaderFunctionArgs) => {
  return json({ apiKey: process.env.SHOPIFY_API_KEY ?? '' });
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();
  const matches = useMatches();
  const shouldHydrate = matches.every((match) => {
    const handle = match.handle as { hydrate?: boolean } | undefined;
    return handle?.hydrate !== false;
  });

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <meta name="shopify-api-key" content={apiKey} />
        <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link rel="stylesheet" href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css" />
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        {shouldHydrate && (
          <>
            <ScrollRestoration />
            <Scripts />
          </>
        )}
      </body>
    </html>
  );
}
