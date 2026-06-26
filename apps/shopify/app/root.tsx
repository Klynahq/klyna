import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useMatches,
} from '@remix-run/react';

export default function App() {
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
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link
          rel="stylesheet"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        />
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
