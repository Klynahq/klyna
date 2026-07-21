import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/node';
import { Form, useActionData, useLoaderData } from '@remix-run/react';
import { getProductKey, products } from '../lib/products';
import { login } from '../shopify.server';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get('shop');
  if (shop) {
    await login(
      new Request(request.url, {
        method: 'POST',
        body: new URLSearchParams({ shop }),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }),
    );
  }
  return json({ shop: shop ?? '', product: products[getProductKey()] });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const errors = await login(request);
  return json({ errors });
};

export default function Auth() {
  const { shop, product } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const errors = actionData?.errors as Record<string, string> | undefined;

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { height: 100%; }
        body { font-family: -apple-system, Inter, system-ui, sans-serif; background: #0b0b0f; color: #f4f4f5; min-height: 100vh; display: grid; place-items: center; padding: 24px; }
        .card { width: 100%; max-width: 430px; background: #13131a; border: 1px solid #2a2a35; border-radius: 14px; padding: 36px; box-shadow: 0 24px 80px rgba(0, 0, 0, 0.5); }
        .mark { width: 36px; height: 36px; display: grid; place-items: center; border-radius: 8px; background: #7c5cff; color: white; font-weight: 800; margin-bottom: 24px; }
        h1 { font-size: 24px; margin-bottom: 8px; }
        p { color: #a1a1aa; line-height: 1.55; margin-bottom: 24px; }
        label { display: block; color: #a1a1aa; font-size: 13px; margin-bottom: 7px; }
        input { width: 100%; border: 1px solid #2a2a35; border-radius: 8px; background: #1a1a23; color: #f4f4f5; padding: 12px 14px; outline: none; }
        input:focus { border-color: #7c5cff; box-shadow: 0 0 0 3px rgba(124, 92, 255, 0.2); }
        button { width: 100%; margin-top: 18px; border: 0; border-radius: 8px; background: #7c5cff; color: white; font-weight: 700; padding: 12px 14px; cursor: pointer; }
        .error { margin-top: 6px; margin-bottom: 0; color: #f87171; font-size: 12px; }
      `}</style>
      <main className="card">
        <div className="mark">K</div>
        <h1>Install {product.name}</h1>
        <p>{product.tagline}</p>
        <Form method="post">
          <label htmlFor="shop">Store domain</label>
          <input
            id="shop"
            type="text"
            name="shop"
            defaultValue={shop}
            placeholder="my-store.myshopify.com"
            autoComplete="off"
          />
          {errors?.shop && <p className="error">{errors.shop}</p>}
          <button type="submit">Connect store</button>
        </Form>
      </main>
    </>
  );
}
