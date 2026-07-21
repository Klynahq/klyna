import type { LoaderFunctionArgs } from '@remix-run/node';
import { getShopSnapshot } from '../lib/shopify-data.server';
import { authenticate } from '../shopify.server';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const snapshot = await getShopSnapshot(admin, 'redirect-guard');
  const lines = [
    ['Redirect from', 'Redirect to'],
    ...snapshot.redirects.map((redirect) => [redirect.path, redirect.target]),
  ];
  const csv = lines.map((row) => row.map(csvCell).join(',')).join('\r\n');

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="klyna-redirect-map-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
};

function csvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}
