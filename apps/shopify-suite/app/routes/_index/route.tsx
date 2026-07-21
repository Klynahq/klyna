import type { LoaderFunctionArgs } from '@remix-run/node';
import { Form, redirect, useLoaderData } from '@remix-run/react';
import { getProductKey, products } from '../../lib/products';
import { login } from '../../shopify.server';
import styles from './styles.module.css';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  if (url.searchParams.get('shop')) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }
  const product = products[getProductKey()];
  return { showForm: Boolean(login), product };
};

export default function Index() {
  const { showForm, product } = useLoaderData<typeof loader>();
  return (
    <main className={styles.index}>
      <section className={styles.content}>
        <h1 className={styles.heading}>{product.name}</h1>
        <p className={styles.text}>{product.tagline}</p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input
                className={styles.input}
                type="text"
                name="shop"
                placeholder="my-store.myshopify.com"
              />
            </label>
            <button className={styles.button} type="submit">
              Connect store
            </button>
          </Form>
        )}
      </section>
    </main>
  );
}
