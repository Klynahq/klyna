import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';

/**
 * Editor sidebar bundle.
 *
 * - JSX → classic runtime so it compiles to `React.createElement(...)`.
 * - Bundled as IIFE so `React` resolves to a global at runtime.
 * - PHP injects `window.React = window.wp.element` before the script loads,
 *   keeping a single React copy across the editor and avoiding hook-mismatch
 *   errors with Gutenberg's bundled React.
 */
export default defineConfig({
  plugins: [
    react({ jsxRuntime: 'classic' }),
    tailwindcss(),
  ],
  build: {
    outDir: resolve(__dirname, '../assets/editor'),
    emptyOutDir: true,
    cssCodeSplit: false,
    sourcemap: false,
    lib: {
      entry: resolve(__dirname, 'src/editor/main.tsx'),
      formats: ['iife'],
      name: 'KlynaEditorSidebar',
      fileName: () => 'index.js',
    },
    rollupOptions: {
      external: ['react', 'react-dom'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'React',
        },
        assetFileNames: (assetInfo) => {
          const name = assetInfo.names?.[0] ?? assetInfo.name ?? '';
          return name.endsWith('.css') ? 'index.css' : '[name][extname]';
        },
      },
    },
  },
});
