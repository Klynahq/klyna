# Klyna

Indie studio building tools for makers, creators, and growth-minded folks.

## Repo layout

```
klyna/
├── apps/
│   └── website/        # Marketing site (Astro + Tailwind v4)
├── packages/
│   ├── core/           # Shared SEO/analysis engine (TypeScript)
│   ├── ui/             # Shared design tokens + components
│   ├── utils/          # Cross-app utilities
│   └── tsconfig/       # Shared TypeScript configs
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

Future apps will live under `apps/` (browser extension, WordPress plugin, Shopify app,
account dashboard, etc.) and all reuse the shared packages.

## Prerequisites

- Node.js 20+ (22 LTS recommended — see `.nvmrc`)
- Corepack (ships with Node) — pnpm is enabled via `packageManager` field

```bash
corepack enable pnpm
```

## Develop

```bash
pnpm install        # install everything
pnpm dev            # start all dev servers (turborepo)
pnpm --filter website dev   # only the marketing site
```

The marketing site runs at <http://localhost:4321>.

## Build

```bash
pnpm build
pnpm typecheck
pnpm lint
```

## Deploy

Marketing site is built as a static site — deploy `apps/website/dist/` to Cloudflare
Pages, Vercel, Netlify, or any static host. No paid services required for hosting.

## License

TBD.
