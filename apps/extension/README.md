# Klyna Inspector

> One-click on-page SEO + GEO audit, in your browser.

A Chromium Manifest V3 extension that audits any page you visit — schema, meta,
headings, internal links, structured data, plus GEO (Generative Engine
Optimization) checks for LLM-citation readiness. Runs entirely client-side,
zero tracking, zero paid APIs.

## Stack

- **Vite 7** with `@crxjs/vite-plugin` (Manifest V3)
- **React 19** for the popup UI
- **Tailwind CSS v4** for styling
- **TypeScript** end-to-end
- **`@klyna/core`** for the audit engine (shared with WordPress + Shopify)

## Develop

```bash
pnpm install
pnpm --filter extension dev   # builds dist/ and watches with HMR
```

Then load the extension in Chrome:

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Point at `apps/extension/dist`

The extension reloads automatically when files change.

## Build for the Chrome Web Store

```bash
pnpm --filter extension build
pnpm --filter extension zip      # produces apps/extension/klyna-inspector.zip
```

Upload that zip to the Chrome Web Store developer console.

## Project layout

```
src/
├── popup/              # The popup UI (React)
│   ├── index.html
│   ├── index.tsx
│   ├── Popup.tsx
│   └── popup.css
├── content/index.ts    # Content script: grabs document HTML on demand
├── background/index.ts # Service worker: optional caching of audit results
├── components/         # React UI primitives
└── lib/messages.ts     # Typed cross-context message protocol
```

## Audit checks

Performed by `@klyna/core/audit`. Each finding includes severity, fix
instructions, and (where useful) evidence. Categories:

- **meta** — title, description, canonical, robots, lang
- **headings** — H1 presence, hierarchy
- **links** — internal-link count, generic anchor text
- **images** — alt-text coverage
- **schema** — JSON-LD presence, Organization + Article schema
- **content** — word count, thin content
- **social** — Open Graph + Twitter Card meta
- **geo** — comparison/listicle/FAQ structure, FAQPage schema

## Privacy

The extension reads only the current tab's HTML, only when you click the icon.
Nothing is sent anywhere — all analysis happens in the popup. The `storage`
permission is used only to cache results locally for 5 minutes so the popup
re-opens fast.
