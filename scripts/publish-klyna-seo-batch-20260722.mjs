import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const blogDir = join(root, 'apps/website/src/content/blog');

const posts = [
  {
    slug: 'shopify-seo-app-free',
    title: 'Shopify SEO App Free: What to Check Before You Install',
    description:
      'A practical free Shopify SEO app checklist for schema, internal links, product metadata, redirects, and store health before you install another app.',
    primary: 'shopify seo app free',
    secondary: 'best free SEO app for Shopify',
    cluster: 'Shopify SEO',
    product: 'Klyna SEO for Shopify',
    productPath: '/products',
    competitorPattern: 'free Shopify SEO app lists, Shopify App Store category pages, SEOAnt comparisons, and broad checker tools',
  },
  {
    slug: 'shopify-seo-app-download',
    title: 'Shopify SEO App Download: A Safer Evaluation Checklist',
    description:
      'Before a Shopify SEO app download, review permissions, theme edits, schema output, redirects, internal links, and rollback safety.',
    primary: 'shopify seo app download',
    secondary: 'Shopify SEO app',
    cluster: 'Shopify SEO',
    product: 'Klyna SEO for Shopify',
    productPath: '/downloads',
    competitorPattern: 'download intent pages, Shopify App Store app pages, setup docs, and review roundups',
  },
  {
    slug: 'shopify-seo-app-review',
    title: 'Shopify SEO App Review: How to Judge the Claims',
    description:
      'A Shopify SEO app review framework for separating useful diagnostics from risky auto-fixes, weak schema, and generic checklist scores.',
    primary: 'shopify seo app review',
    secondary: 'Shopify SEO app reviews',
    cluster: 'Shopify SEO',
    product: 'Klyna SEO for Shopify',
    productPath: '/products',
    competitorPattern: 'review posts, App Store ratings, Reddit opinions, and feature comparison tables',
  },
  {
    slug: 'best-seo-app-for-shopify',
    title: 'Best SEO App for Shopify: Decision Checklist for 2026',
    description:
      'Choose the best SEO app for Shopify by checking schema, product metadata, internal links, redirects, indexation, speed impact, and support posture.',
    primary: 'best SEO app for Shopify',
    secondary: 'Shopify SEO optimization',
    cluster: 'Shopify SEO',
    product: 'Klyna SEO for Shopify',
    productPath: '/products',
    competitorPattern: 'best-app lists, SEOAnt pages, Plug in SEO comparisons, and Shopify App Store category pages',
  },
  {
    slug: 'best-free-seo-app-for-shopify',
    title: 'Best Free SEO App for Shopify: What Free Should Actually Cover',
    description:
      'A buyer-focused guide to the best free SEO app for Shopify, including what free tools can fix and when a merchant needs deeper implementation.',
    primary: 'best free SEO app for Shopify',
    secondary: 'free Shopify SEO app',
    cluster: 'Shopify SEO',
    product: 'Klyna SEO for Shopify',
    productPath: '/downloads',
    competitorPattern: 'free app roundups, freemium SEO apps, and Shopify App Store comparison pages',
  },
  {
    slug: 'shopify-seo-checklist',
    title: 'Shopify SEO Checklist: Store Health Before More Apps',
    description:
      'A Shopify SEO checklist for product schema, titles, collections, internal links, redirects, image metadata, feeds, and leftover app code.',
    primary: 'Shopify SEO checklist',
    secondary: 'Shopify SEO optimization',
    cluster: 'Shopify SEO',
    product: 'Klyna SEO for Shopify',
    productPath: '/products',
    competitorPattern: 'Shopify SEO checklist posts, technical SEO guides, and app-led audit pages',
  },
  {
    slug: 'shopify-seo-optimization',
    title: 'Shopify SEO Optimization: Fix the Store System, Not One Tag',
    description:
      'Shopify SEO optimization should cover product data, schema, internal links, redirects, feeds, speed, and theme residue as one store system.',
    primary: 'Shopify SEO optimization',
    secondary: 'Shopify SEO app',
    cluster: 'Shopify SEO',
    product: 'Klyna SEO for Shopify',
    productPath: '/products',
    competitorPattern: 'agency guides, SEO app pages, and broad optimization explainers',
  },
  {
    slug: 'seoant-shopify-alternative',
    title: 'SEOAnt Shopify Alternative: What to Compare First',
    description:
      'Comparing a SEOAnt Shopify alternative? Review diagnostics, schema accuracy, internal links, redirects, automation controls, and theme safety.',
    primary: 'SEOAnt Shopify alternative',
    secondary: 'seoant shopify',
    cluster: 'Shopify SEO',
    product: 'Klyna SEO for Shopify',
    productPath: '/products',
    competitorPattern: 'SEOAnt branded results, App Store listings, alternative pages, and review roundups',
  },
  {
    slug: 'shopify-popup-capture-app-free',
    title: 'Shopify Popup Capture App Free: What to Test First',
    description:
      'A free Shopify popup capture app checklist for consent, timing, mobile UX, email capture, SMS fields, targeting, and theme impact.',
    primary: 'shopify popup capture app free',
    secondary: 'Shopify popup app free',
    cluster: 'Shopify popup capture',
    product: 'Klyna Capture',
    productPath: '/downloads',
    competitorPattern: 'Shopify App Store popup category pages, Wisepops lists, OptiMonk pages, and Reddit threads',
  },
  {
    slug: 'shopify-popup-app-free',
    title: 'Shopify Popup App Free: Safe Setup for Email Capture',
    description:
      'Use this Shopify popup app free setup checklist to avoid annoying mobile popups, consent mistakes, duplicate scripts, and weak list quality.',
    primary: 'Shopify popup app free',
    secondary: 'how to add pop up on Shopify free',
    cluster: 'Shopify popup capture',
    product: 'Klyna Capture',
    productPath: '/downloads',
    competitorPattern: 'free popup tools, Shopify App Store pages, tutorial posts, and merchant review threads',
  },
  {
    slug: 'how-to-add-pop-up-on-shopify-free',
    title: 'How to Add Pop Up on Shopify Free Without Hurting UX',
    description:
      'A free Shopify popup setup guide for timing, triggers, marketing consent, mobile layout, welcome offers, and measuring email capture quality.',
    primary: 'how to add pop up on Shopify free',
    secondary: 'Shopify pop up banner',
    cluster: 'Shopify popup capture',
    product: 'Klyna Capture',
    productPath: '/downloads',
    competitorPattern: 'Shopify tutorials, free popup guides, YouTube-style setup intent, and App Store docs',
  },
  {
    slug: 'best-pop-up-app-for-shopify',
    title: 'Best Pop Up App for Shopify: What Merchants Should Compare',
    description:
      'Choose the best pop up app for Shopify by comparing targeting, consent handling, design controls, mobile behavior, speed, and analytics.',
    primary: 'best pop up app for Shopify',
    secondary: 'Shopify popup capture app',
    cluster: 'Shopify popup capture',
    product: 'Klyna Capture',
    productPath: '/products',
    competitorPattern: 'Wisepops comparison posts, Shopify App Store category pages, OptiMonk, and Reddit recommendations',
  },
  {
    slug: 'shopify-pop-up-banner',
    title: 'Shopify Pop Up Banner: Better Capture Without the Usual Friction',
    description:
      'A Shopify pop up banner guide for offers, triggers, mobile layout, privacy consent, speed impact, and when not to show the popup.',
    primary: 'Shopify pop up banner',
    secondary: 'Shopify popup app',
    cluster: 'Shopify popup capture',
    product: 'Klyna Capture',
    productPath: '/products',
    competitorPattern: 'banner tutorials, popup app pages, notification tools, and Shopify App Store results',
  },
  {
    slug: 'optimonk-shopify-app-alternative',
    title: 'OptiMonk Shopify App Alternative: Evaluation Checklist',
    description:
      'Comparing an OptiMonk Shopify app alternative? Check popup targeting, consent, mobile UX, analytics, speed, and list-quality controls.',
    primary: 'OptiMonk Shopify app alternative',
    secondary: 'OptiMonk shopify app',
    cluster: 'Shopify popup capture',
    product: 'Klyna Capture',
    productPath: '/products',
    competitorPattern: 'OptiMonk branded results, alternative pages, popup roundups, and App Store comparisons',
  },
  {
    slug: 'shopify-sticky-cart-app-review',
    title: 'Shopify Sticky Cart App Review: What Actually Matters',
    description:
      'A Shopify sticky cart app review checklist for mobile UX, variant selection, free-shipping bars, cart drawers, speed, and analytics.',
    primary: 'Shopify sticky cart app review',
    secondary: 'sticky add to cart Shopify',
    cluster: 'Shopify sticky cart',
    product: 'Klyna Sticky Cart',
    productPath: '/downloads',
    competitorPattern: 'STKY App Store results, Smart Sticky Add To Cart, review snippets, and app comparison pages',
  },
  {
    slug: 'sticky-add-to-cart-shopify',
    title: 'Sticky Add to Cart Shopify: Mobile UX Checklist',
    description:
      'A sticky add to cart Shopify checklist for product pages, variant pickers, quick buy, cart drawer behavior, free shipping progress, and speed.',
    primary: 'sticky add to cart Shopify',
    secondary: 'Shopify sticky cart app',
    cluster: 'Shopify sticky cart',
    product: 'Klyna Sticky Cart',
    productPath: '/downloads',
    competitorPattern: 'Shopify App Store sticky cart pages, Dawn theme tutorials, and mobile conversion guides',
  },
  {
    slug: 'cart-drawer-shopify-app',
    title: 'Cart Drawer Shopify App: What to Check Before Adding One',
    description:
      'A cart drawer Shopify app checklist for upsells, sticky cart behavior, free shipping bars, accessibility, theme conflicts, and speed impact.',
    primary: 'cart drawer Shopify app',
    secondary: 'Shopify app store cart drawer',
    cluster: 'Shopify sticky cart',
    product: 'Klyna Sticky Cart',
    productPath: '/products',
    competitorPattern: 'cart drawer apps, sticky add-to-cart tools, upsell app listings, and theme tutorials',
  },
  {
    slug: 'essential-sticky-add-to-cart-shopify-alternative',
    title: 'Essential Sticky Add to Cart Shopify Alternative Checklist',
    description:
      'Comparing an Essential sticky add to cart Shopify alternative? Review mobile behavior, cart drawer logic, analytics, theme safety, and speed.',
    primary: 'Essential sticky add to cart Shopify alternative',
    secondary: 'Shopify sticky cart app',
    cluster: 'Shopify sticky cart',
    product: 'Klyna Sticky Cart',
    productPath: '/products',
    competitorPattern: 'Essential app branded SERPs, sticky cart app pages, and feature comparison results',
  },
  {
    slug: 'free-upsell-app-shopify',
    title: 'Free Upsell App Shopify: Safe AOV Lift Without Checkout Friction',
    description:
      'A free upsell app Shopify checklist for in-cart offers, post-purchase offers, discount rules, mobile UX, and honest AOV measurement.',
    primary: 'free upsell app Shopify',
    secondary: 'cart upsell Shopify app',
    cluster: 'Shopify upsell',
    product: 'Klyna Upsell',
    productPath: '/downloads',
    competitorPattern: 'Shopify upsell category pages, Selleasy listings, free app searches, and Reddit merchant threads',
  },
  {
    slug: 'best-upsell-app-for-shopify',
    title: 'Best Upsell App for Shopify: Cart and Post-Purchase Checklist',
    description:
      'Choose the best upsell app for Shopify by comparing cart offers, post-purchase flow, offer rules, discounts, analytics, and theme safety.',
    primary: 'best upsell app for Shopify',
    secondary: 'Shopify upsell app',
    cluster: 'Shopify upsell',
    product: 'Klyna Upsell',
    productPath: '/products',
    competitorPattern: 'Shopify App Store upsell pages, Selleasy, post-purchase upsell listings, and Reddit comparison threads',
  },
];

function frontmatter(post) {
  return `---\ntitle: \"${post.title}\"\ndescription: \"${post.description}\"\npublishedAt: 2026-07-22\nupdatedAt: 2026-07-22\nauthor: \"Klyna\"\ntags: [\"Shopify\", \"${post.cluster}\", \"${post.primary}\", \"SEO\"]\ncategory: \"Tools\"\nfeatured: false\n---`;
}

function body(post) {
  return `${frontmatter(post)}

If you searched for **${post.primary}**, you are probably not looking for another generic app list. You are trying to decide whether a Shopify app can solve a real store problem without adding theme debris, slowing the storefront, confusing consent, or creating another cleanup job later.

This guide is built from the July 22, 2026 Klyna SEO research pass. Google Search Console is still mostly branded for Klyna, which means the site needs non-branded Shopify app intent pages. Google SERPs and the Ahrefs Toolbar showed demand around ${post.primary}, ${post.secondary}, and comparison-style app checks. Ahrefs Site Explorer was opened in Chrome, but row-level exports were limited by an inactive-workspace banner, so this page uses GSC plus SERP and toolbar evidence rather than pretending a full Ahrefs export was available.

## Short answer

A page targeting **${post.primary}** should help a merchant compare the problem, the app behavior, the risk, and the next action. For ${post.product}, that means starting with diagnostics and guardrails before asking the merchant to install yet another script or automate another store change.

The better question is not "which app has the longest feature list?" It is "which app solves this job with the least theme risk, the clearest data, and the safest rollback path?"

## Why this keyword matters for Klyna

The SERP pattern is full of ${post.competitorPattern}. Those pages answer part of the journey, but many of them skip the operational questions a Shopify merchant actually has before installing an app:

- What permission does the app need?
- Does it edit the theme or inject scripts?
- Can the merchant test it on a backup or preview first?
- Does it create clean analytics, or just another dashboard?
- What happens if the app is removed later?
- Does it improve the storefront, or only add another widget?

That is where Klyna should compete. Klyna products are positioned as practical tools for store operators, not magic growth buttons.

## Evaluation checklist

| Check | What to inspect | Why it matters |
| --- | --- | --- |
| Store fit | Match the app to one job, not a broad promise. | Apps get messy when one install tries to solve every growth problem. |
| Theme safety | Check whether the app injects code, edits templates, or leaves snippets behind. | Old app code is a common source of speed, tracking, and debugging problems. |
| Merchant control | Look for preview, undo, export, and clear setup states. | Shopify teams need a way to test without risking a live campaign. |
| Measurement | Confirm what the app measures and what it ignores. | AOV, capture rate, or SEO score can be misleading without context. |
| Support path | Review docs, changelog posture, and how failures are explained. | A useful app should reduce support tickets, not create new mysteries. |

## Free versus paid

Free can be useful when the store needs a narrow check, a beta tool, or a low-risk first pass. Free is weaker when the work requires historical monitoring, advanced rules, team workflows, deep support, or automated changes that could affect revenue.

For ${post.primary}, start free if you only need visibility. Move to a stronger paid tool or implementation workflow when the same issue appears across product pages, collections, theme scripts, app embeds, analytics, and checkout-adjacent paths.

## What to test before installing

Before installing any Shopify app for this job, run a quick preflight:

1. Duplicate the theme if the app touches storefront layout or scripts.
2. Record the current product page, cart, collection, and homepage behavior.
3. Check page speed and console errors before adding anything.
4. Review the app permissions and whether they match the feature you actually need.
5. Install on a development or preview setup when possible.
6. Test mobile first because most Shopify conversion problems show up there.
7. Recheck analytics events, consent behavior, and customer-facing forms after install.
8. Document how to uninstall the app cleanly.

This is not bureaucracy. It is how merchants avoid buying a quick conversion lift and inheriting a long-term storefront mess.

## Where ${post.product} fits

${post.product} fits this search when the merchant wants a focused tool with clear evidence and practical guardrails. Klyna should not compete by claiming every store will get instant ranking, instant AOV lift, or instant list growth. The stronger angle is operational: find the issue, explain the risk, give the merchant a safe next step, and keep the workflow readable.

Start from [Klyna products](/products), or use the [team downloads](/downloads) if you are evaluating the current beta builds. For broader Shopify cleanup context, read [the leftover Shopify app code cleanup guide](/blog/shopify-leftover-app-code-cleanup).

## Comparison questions

Ask these before you choose an app:

- Does this app solve a current store problem or only sound useful?
- Does it make the storefront slower or add script weight on every page?
- Does it work with the current theme, cart drawer, product forms, consent tools, and analytics stack?
- Can the setup be reversed cleanly?
- Does the app explain what it found in plain language?
- Can a non-technical merchant understand what to do next?

## FAQ

### Is a ${post.primary} tool enough for a serious Shopify store?

Sometimes. It is enough when the store needs a quick diagnostic or a low-risk beta tool. It is not enough when the store needs careful theme cleanup, migration support, complex rules, or ongoing monitoring.

### Should I install several Shopify apps at once?

No. Install one app, record the behavior, test the storefront, and measure the impact before adding another. Most messy Shopify stacks become messy through small overlapping installs.

### What should I check after uninstalling an app?

Check theme snippets, app embeds, script tags, pixels, product pages, cart behavior, schema, and storefront speed. Klyna Cleanroom exists because uninstalling an app does not always remove every trace.

### What is the safest Klyna next step?

Start with [Klyna products](${post.productPath}) and choose the tool that matches the exact Shopify problem. If you are unsure, begin with diagnostics before automation.
`;
}

await mkdir(blogDir, { recursive: true });

for (const post of posts) {
  await writeFile(join(blogDir, `${post.slug}.mdx`), body(post));
  console.log(`+ ${post.slug}.mdx`);
}

console.log(`Published ${posts.length} Klyna Shopify SEO posts.`);
