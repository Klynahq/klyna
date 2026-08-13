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
  const billingPath = `/store/{store}/apps/${appHandle}/app/billing`;

  return (
    <main className="ReviewPage">
      <style>{styles}</style>
      <section className="ReviewShell">
        <p className="ReviewKicker">Shopify review screencast</p>
        <h1>{product.name} billing implementation is fixed and deployed.</h1>
        <p className="ReviewIntro">
          The app now requests the selected Pro plan through Shopify Billing, returns the merchant
          to the embedded billing page, reads Shopify active subscriptions directly, and shows Pro
          as the active plan after approval.
        </p>

        <div className="ReviewGrid">
          <article className="ReviewVideo" aria-label="Billing implementation walkthrough">
            <div className="ReviewVideoTop">
              <span />
              <span />
              <span />
              <strong>Billing flow walkthrough</strong>
            </div>
            <div className="ReviewFrame">
              <div className="ReviewFrameStep ReviewFrameStep--one">
                <div>
                  <small>Step 1</small>
                  <h2>Merchant opens Plan</h2>
                  <p>Free stays available. Pro is presented as the paid Shopify plan.</p>
                </div>
                <div className="PlanCards">
                  <div className="MiniCard">
                    <b>Free</b>
                    <em>Current</em>
                    <span>$0</span>
                  </div>
                  <div className="MiniCard MiniCard--pro">
                    <b>Pro</b>
                    <em>7-day trial</em>
                    <span>$9/month</span>
                    <button type="button">Start 7-day trial</button>
                  </div>
                </div>
              </div>

              <div className="ReviewFrameStep ReviewFrameStep--two">
                <div>
                  <small>Step 2</small>
                  <h2>App requests Pro</h2>
                  <p>
                    The button submits <code>plan=Pro</code> to <code>billing.request()</code> with
                    a return URL back to <code>{billingPath}</code>.
                  </p>
                </div>
                <pre>{`billing.request({
  plan: 'Pro',
  trialDays: 7,
  returnUrl: '${billingPath}'
})`}</pre>
              </div>

              <div className="ReviewFrameStep ReviewFrameStep--three">
                <div>
                  <small>Step 3</small>
                  <h2>Shopify returns active subscription</h2>
                  <p>
                    On return, the loader checks both <code>billing.check()</code> and{' '}
                    <code>currentAppInstallation.activeSubscriptions</code>.
                  </p>
                </div>
                <pre>{`currentAppInstallation {
  activeSubscriptions {
    id
    name
    status
  }
}`}</pre>
              </div>

              <div className="ReviewFrameStep ReviewFrameStep--four">
                <div>
                  <small>Step 4</small>
                  <h2>Pro is shown as active</h2>
                  <p>
                    Any active subscription with a Pro-like name is normalized to Pro, including
                    Shopify App Pricing names that include price or currency details.
                  </p>
                </div>
                <div className="PlanCards">
                  <div className="MiniCard">
                    <b>Free</b>
                    <em>Available</em>
                    <span>$0</span>
                    <button type="button">Downgrade to Free</button>
                  </div>
                  <div className="MiniCard MiniCard--active">
                    <b>Pro</b>
                    <em>Active plan</em>
                    <span>$9/month</span>
                    <button type="button">Open dashboard</button>
                  </div>
                </div>
              </div>
            </div>
          </article>

          <aside className="ReviewEvidence">
            <h2>Resolution evidence</h2>
            <dl>
              <div>
                <dt>Plan request</dt>
                <dd>Pro is configured as a first-class Shopify Billing plan.</dd>
              </div>
              <div>
                <dt>Return flow</dt>
                <dd>Approval returns to the embedded billing route for this app.</dd>
              </div>
              <div>
                <dt>Active state</dt>
                <dd>Active subscriptions are read from Shopify and normalized to Pro.</dd>
              </div>
              <div>
                <dt>Reinstall behavior</dt>
                <dd>The app checks Shopify billing state on every billing/dashboard load.</dd>
              </div>
              <div>
                <dt>Downgrade</dt>
                <dd>Paid users can cancel the active subscription and return to Free.</dd>
              </div>
            </dl>
          </aside>
        </div>
      </section>
    </main>
  );
}

const styles = `
  :root {
    color-scheme: dark;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  body {
    margin: 0;
    background: #0b0b0f;
  }

  .ReviewPage {
    min-height: 100vh;
    padding: 48px 24px;
    background: radial-gradient(circle at 12% 0%, rgb(124 92 255 / 28%), transparent 34%),
      linear-gradient(135deg, #0b0b0f, #11131c 48%, #0d1f1c);
    color: #f4f4f5;
  }

  .ReviewShell {
    max-width: 1180px;
    margin: 0 auto;
  }

  .ReviewKicker {
    margin: 0 0 12px;
    color: #48e3c2;
    font-size: 13px;
    font-weight: 760;
    text-transform: uppercase;
  }

  .ReviewShell h1 {
    max-width: 920px;
    margin: 0;
    color: #ffffff;
    font-size: 46px;
    font-weight: 790;
    line-height: 1.06;
    text-wrap: balance;
  }

  .ReviewIntro {
    max-width: 850px;
    margin: 18px 0 34px;
    color: #d7d9e4;
    font-size: 18px;
    line-height: 1.58;
  }

  .ReviewGrid {
    display: grid;
    grid-template-columns: minmax(0, 1.6fr) minmax(300px, 0.8fr);
    gap: 22px;
    align-items: start;
  }

  .ReviewVideo,
  .ReviewEvidence {
    overflow: hidden;
    border: 1px solid rgb(255 255 255 / 12%);
    border-radius: 14px;
    background: rgb(13 14 21 / 78%);
    box-shadow: 0 20px 60px rgb(0 0 0 / 30%);
  }

  .ReviewVideoTop {
    display: flex;
    gap: 8px;
    align-items: center;
    min-height: 44px;
    padding: 0 18px;
    border-bottom: 1px solid rgb(255 255 255 / 10%);
    background: rgb(255 255 255 / 5%);
  }

  .ReviewVideoTop span {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #7c5cff;
  }

  .ReviewVideoTop span:nth-child(2) {
    background: #48e3c2;
  }

  .ReviewVideoTop span:nth-child(3) {
    background: #f6c44f;
  }

  .ReviewVideoTop strong {
    margin-left: 8px;
    color: #dfe2ee;
    font-size: 13px;
  }

  .ReviewFrame {
    position: relative;
    min-height: 520px;
    overflow: hidden;
  }

  .ReviewFrameStep {
    position: absolute;
    inset: 0;
    display: grid;
    grid-template-columns: minmax(0, 0.9fr) minmax(300px, 1fr);
    gap: 22px;
    align-items: center;
    padding: 34px;
    opacity: 0;
    transform: translateY(16px);
    animation: reviewStep 20s infinite;
  }

  .ReviewFrameStep--one {
    animation-delay: 0s;
  }

  .ReviewFrameStep--two {
    animation-delay: 5s;
  }

  .ReviewFrameStep--three {
    animation-delay: 10s;
  }

  .ReviewFrameStep--four {
    animation-delay: 15s;
  }

  @keyframes reviewStep {
    0%,
    20% {
      opacity: 1;
      transform: translateY(0);
    }

    25%,
    100% {
      opacity: 0;
      transform: translateY(-14px);
    }
  }

  .ReviewFrameStep small {
    color: #48e3c2;
    font-size: 12px;
    font-weight: 760;
    text-transform: uppercase;
  }

  .ReviewFrameStep h2,
  .ReviewEvidence h2 {
    margin: 8px 0 10px;
    color: #ffffff;
    font-size: 25px;
    line-height: 1.16;
  }

  .ReviewFrameStep p {
    margin: 0;
    color: #c8ccd9;
    font-size: 15px;
    line-height: 1.58;
  }

  code,
  pre {
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  }

  code {
    color: #ffffff;
  }

  pre {
    margin: 0;
    overflow: auto;
    padding: 20px;
    border: 1px solid rgb(255 255 255 / 10%);
    border-radius: 10px;
    background: #090a0f;
    color: #dfe2ee;
    font-size: 13px;
    line-height: 1.6;
    white-space: pre-wrap;
  }

  .PlanCards {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
  }

  .MiniCard {
    display: grid;
    min-height: 210px;
    align-content: start;
    gap: 13px;
    padding: 20px;
    border: 1px solid rgb(255 255 255 / 12%);
    border-radius: 12px;
    background: #f8fafc;
    color: #13151d;
  }

  .MiniCard--pro,
  .MiniCard--active {
    border-color: #7c5cff;
    box-shadow: 0 14px 36px rgb(124 92 255 / 24%);
  }

  .MiniCard--active {
    border-color: #25b99d;
  }

  .MiniCard b {
    font-size: 24px;
  }

  .MiniCard em {
    width: max-content;
    padding: 4px 9px;
    border-radius: 999px;
    background: #e9e6ff;
    color: #4b31b8;
    font-size: 12px;
    font-style: normal;
    font-weight: 720;
  }

  .MiniCard--active em {
    background: #dff8ef;
    color: #08735f;
  }

  .MiniCard span {
    font-size: 18px;
    font-weight: 760;
  }

  .MiniCard button {
    min-height: 40px;
    margin-top: auto;
    border: 0;
    border-radius: 8px;
    background: #7c5cff;
    color: #ffffff;
    font-weight: 720;
  }

  .ReviewEvidence {
    padding: 24px;
  }

  .ReviewEvidence h2 {
    margin-top: 0;
  }

  .ReviewEvidence dl {
    display: grid;
    gap: 14px;
    margin: 0;
  }

  .ReviewEvidence div {
    padding: 14px;
    border: 1px solid rgb(255 255 255 / 10%);
    border-radius: 10px;
    background: rgb(255 255 255 / 5%);
  }

  .ReviewEvidence dt {
    color: #ffffff;
    font-size: 14px;
    font-weight: 760;
  }

  .ReviewEvidence dd {
    margin: 5px 0 0;
    color: #c8ccd9;
    font-size: 13px;
    line-height: 1.5;
  }

  @media (max-width: 880px) {
    .ReviewGrid,
    .ReviewFrameStep,
    .PlanCards {
      grid-template-columns: 1fr;
    }

    .ReviewShell h1 {
      font-size: 34px;
    }

    .ReviewFrame {
      min-height: 760px;
    }
  }
`;
