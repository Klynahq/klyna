import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';

/**
 * Single-bundle build for the admin app.
 * The editor sidebar is built separately by `vite.editor.config.ts`
 * because it externalizes React → wp.element so Gutenberg's React
 * stays the one source of truth on the post-editor screen.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: resolve(__dirname, '../assets/admin'),
    emptyOutDir: true,
    cssCodeSplit: false,
    sourcemap: false,
    rollupOptions: {
      input: resolve(__dirname, 'src/main.tsx'),
      output: {
        entryFileNames: 'index.js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          const name = assetInfo.names?.[0] ?? assetInfo.name ?? '';
          return name.endsWith('.css') ? 'index.css' : 'assets/[name]-[hash][extname]';
        },
      },
    },
  },
  server: {
    port: 5174,
  },
});
