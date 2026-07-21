import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/node';
import { Form, useActionData, useLoaderData } from '@remix-run/react';
import { login } from '../shopify.server';

export const links = () => [];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get('shop');
  // If shop is already in the URL, kick off OAuth immediately — no form needed
  if (shop) {
    await login(
      new Request(request.url, {
        method: 'POST',
        body: new URLSearchParams({ shop }),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }),
    );
    // login() throws a redirect on success — if we reach here the shop was invalid
  }
  return json({ shop: shop ?? '' });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const errors = await login(request);
  return json({ errors });
};

export default function Auth() {
  const { shop } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const errors = actionData?.errors as Record<string, string> | undefined;

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { height: 100%; }
        body {
          font-family: -apple-system, 'Inter', system-ui, sans-serif;
          background: #0b0b0f;
          color: #f4f4f5;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          padding: 24px;
        }
        .card {
          width: 100%;
          max-width: 420px;
          background: #13131a;
          border: 1px solid #2a2a35;
          border-radius: 16px;
          padding: 40px;
          box-shadow: 0 24px 80px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(124, 92, 255, 0.08);
        }
        .logo {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 28px;
        }
        .logo-mark {
          width: 36px;
          height: 36px;
          border-radius: 8px;
          background: linear-gradient(135deg, #7c5cff 0%, #5b3df0 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 18px;
          color: #fff;
          letter-spacing: -1px;
          flex-shrink: 0;
        }
        .logo-wordmark {
          font-size: 20px;
          font-weight: 700;
          letter-spacing: -0.5px;
          background: linear-gradient(135deg, #7c5cff, #9277ff);
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        h1 {
          font-size: 22px;
          font-weight: 700;
          letter-spacing: -0.4px;
          color: #f4f4f5;
          margin-bottom: 6px;
        }
        .subtitle {
          font-size: 14px;
          color: #71717a;
          margin-bottom: 28px;
          line-height: 1.5;
        }
        label {
          display: block;
          font-size: 13px;
          font-weight: 500;
          color: #a1a1aa;
          margin-bottom: 6px;
        }
        input[type="text"] {
          width: 100%;
          padding: 11px 14px;
          background: #1a1a23;
          border: 1px solid #2a2a35;
          border-radius: 8px;
          color: #f4f4f5;
          font-size: 14px;
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
          appearance: none;
          -webkit-appearance: none;
        }
        input[type="text"]::placeholder {
          color: #52525b;
        }
        input[type="text"]:focus {
          border-color: #7c5cff;
          box-shadow: 0 0 0 3px rgba(124, 92, 255, 0.2);
        }
        .field-error {
          font-size: 12px;
          color: #f87171;
          margin-top: 5px;
        }
        .submit-btn {
          width: 100%;
          margin-top: 20px;
          padding: 12px;
          background: linear-gradient(135deg, #7c5cff 0%, #5b3df0 100%);
          border: none;
          border-radius: 8px;
          color: #fff;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          transition: box-shadow 0.15s, transform 0.1s;
          box-shadow: 0 4px 16px rgba(124, 92, 255, 0.35);
        }
        .submit-btn:hover {
          box-shadow: 0 6px 24px rgba(124, 92, 255, 0.5);
          transform: translateY(-1px);
        }
        .submit-btn:active {
          transform: translateY(0);
          background: linear-gradient(135deg, #5b3df0 0%, #4a2fd4 100%);
        }
        .footer-note {
          margin-top: 20px;
          font-size: 12px;
          color: #52525b;
          text-align: center;
          line-height: 1.5;
        }
      `}</style>

      <div className="card">
        <div className="logo">
          <div className="logo-mark">K</div>
          <span className="logo-wordmark">Klyna</span>
        </div>

        <h1>Install Klyna SEO</h1>
        <p className="subtitle">
          Enter your Shopify store domain to connect your store and start your free audit.
        </p>

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
          {errors?.shop && <p className="field-error">{errors.shop}</p>}

          <button type="submit" className="submit-btn">
            Connect store →
          </button>
        </Form>

        <p className="footer-note">Klyna is free to install. No credit card required.</p>
      </div>
    </>
  );
}
