import { getProductKey, products } from '../lib/products';

const appHandles = {
  cleanroom: 'klyna-cleanroom',
  'feed-doctor': 'klyna-feed-doctor',
  'pixel-doctor': 'klyna-pixel-doctor',
  'promo-qa': 'klyna-promo-qa',
  'redirect-guard': 'klyna-redirect-guard',
} as const;

export default function BillingReviewProof() {
  const productKey = getProductKey();
  const product = products[productKey];
  const appHandle = appHandles[productKey];

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#0b0b0f',
        color: '#f4f4f5',
        fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
        padding: '48px 24px',
      }}
    >
      <section style={{ maxWidth: 860, margin: '0 auto' }}>
        <p style={{ color: '#42e8c4', fontWeight: 700, margin: '0 0 12px' }}>
          Shopify review proof
        </p>
        <h1 style={{ fontSize: 42, lineHeight: 1.1, margin: '0 0 16px' }}>
          {product.name} billing fix is deployed.
        </h1>
        <p style={{ color: '#c7c7d1', fontSize: 18, lineHeight: 1.6, margin: '0 0 32px' }}>
          This app now implements Starter and Pro as first-class Shopify Billing API plans, requests
          the selected plan, and displays the active plan returned by Shopify after approval.
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 16,
          }}
        >
          {[
            ['Plans', 'Starter and Pro are both configured in the Shopify billing config.'],
            [
              'Request flow',
              'Each plan button submits the selected plan name to billing.request().',
            ],
            [
              'Return flow',
              `After approval, merchants return to /store/{store}/apps/${appHandle}/app/billing.`,
            ],
            [
              'Active state',
              'The billing screen reads active subscriptions, prefers Pro during upgrades, and labels it Active plan.',
            ],
          ].map(([title, body]) => (
            <article
              key={title}
              style={{
                border: '1px solid #2a2a35',
                borderRadius: 8,
                background: '#14141c',
                padding: 20,
              }}
            >
              <h2 style={{ fontSize: 16, margin: '0 0 8px' }}>{title}</h2>
              <p style={{ color: '#a1a1aa', lineHeight: 1.55, margin: 0 }}>{body}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
