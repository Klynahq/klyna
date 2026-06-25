import { type LoaderFunctionArgs, redirect } from '@remix-run/node';
import { Form, useLoaderData } from '@remix-run/react';

import styles from './styles.module.css';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  if (
    url.searchParams.get('shop') ||
    url.searchParams.get('host') ||
    url.searchParams.get('id_token')
  ) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }
  return { showForm: true };
};

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();
  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>Klyna Bundles</h1>
        <p className={styles.text}>
          Bundles, frequently-bought-together, and volume discounts that lift
          average order value. Build product bundles and quantity breaks, then
          show the savings right on the product page.
        </p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span>e.g. my-shop-domain.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">
              Log in
            </button>
          </Form>
        )}
      </div>
    </div>
  );
}
