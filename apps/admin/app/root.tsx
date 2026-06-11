import { Links, Meta, Outlet, Scripts, ScrollRestoration } from '@remix-run/react';
import type { LinksFunction, MetaFunction } from '@remix-run/node';
import styles from './styles/app.css?url';

export const links: LinksFunction = () => [
  { rel: 'stylesheet', href: styles },
  { rel: 'preconnect', href: 'https://rsms.me' },
  { rel: 'stylesheet', href: 'https://rsms.me/inter/inter.css' },
];

export const meta: MetaFunction = () => [
  { title: 'Klyna Admin' },
  { name: 'viewport', content: 'width=device-width,initial-scale=1' },
  { name: 'robots', content: 'noindex, nofollow' },
];

export default function App() {
  return (
    <html lang="en" className="dark">
      <head>
        <meta charSet="utf-8" />
        <Meta />
        <Links />
      </head>
      <body className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
