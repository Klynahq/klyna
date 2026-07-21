import { vitePlugin as remix } from '@remix-run/dev';
import { installGlobals } from '@remix-run/node';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

installGlobals({ nativeFetch: true });

if (
  process.env.HOST &&
  (!process.env.SHOPIFY_APP_URL || process.env.SHOPIFY_APP_URL === process.env.HOST)
) {
  process.env.SHOPIFY_APP_URL = process.env.HOST;
  process.env.HOST = undefined;
}

const host = new URL(process.env.SHOPIFY_APP_URL ?? 'http://localhost').hostname;
const hmrConfig =
  host === 'localhost'
    ? { protocol: 'ws' as const, host: 'localhost', port: 65001, clientPort: 65001 }
    : {
        protocol: 'wss' as const,
        host,
        port: Number.parseInt(process.env.FRONTEND_PORT ?? '8002'),
        clientPort: 443,
      };

export default defineConfig({
  server: {
    allowedHosts: [host],
    cors: { preflightContinue: true },
    port: Number(process.env.PORT ?? 3000),
    hmr: hmrConfig,
    fs: { allow: ['app', 'node_modules'] },
  },
  plugins: [
    remix({
      ignoredRouteFiles: ['**/.*'],
      future: {
        v3_fetcherPersist: true,
        v3_relativeSplatPath: true,
        v3_throwAbortReason: true,
      },
    }),
    tsconfigPaths(),
  ],
  build: { assetsInlineLimit: 0 },
});
