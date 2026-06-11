import type { LoaderFunctionArgs, MetaFunction } from '@remix-run/node';
import { json } from '@remix-run/node';
import { Outlet, useLoaderData } from '@remix-run/react';
import { TopNav } from '~/components/nav';
import { csrfFor, requireAdmin } from '~/lib/session.server';

export const meta: MetaFunction = () => [{ title: 'Klyna Admin' }];

export async function loader({ request }: LoaderFunctionArgs) {
  const admin = await requireAdmin(request);
  return json({ email: admin.email, csrf: csrfFor(admin) });
}

export default function AdminLayout() {
  const { email, csrf } = useLoaderData<typeof loader>();
  return (
    <div className="min-h-screen">
      <TopNav email={email} csrf={csrf} />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <Outlet context={{ csrf, email }} />
      </main>
    </div>
  );
}
