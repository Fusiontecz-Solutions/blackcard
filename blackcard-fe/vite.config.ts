import path from 'path';
import { defineConfig } from 'vite';
import * as vite from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/** Confirms rolldown-vite (Rust bundler) is active — Vite's path to Turbopack-class performance. */
function rolldownBundlerBanner(): vite.Plugin {
  return {
    name: 'rolldown-bundler-banner',
    configureServer(server) {
      const version =
        'rolldownVersion' in vite && typeof vite.rolldownVersion === 'string'
          ? vite.rolldownVersion
          : 'unknown';
      server.config.logger.info(
        `[bundler] rolldown-vite ${version} (Rust) — use this stack instead of Next.js Turbopack on Vite apps`,
      );
    },
  };
}

// https://vite.dev/guide/rolldown
export default defineConfig({
  plugins: [rolldownBundlerBanner(), react(), tailwindcss()],
  optimizeDeps: {
    // Crawl all sources up front so deps are discovered at startup, not mid-session.
    // Mid-session re-optimization renames node_modules/.vite/deps, which fails with EPERM on Windows.
    entries: ['index.html', 'src/**/*.{ts,tsx}'],
    include: ['stream-browserify', 'buffer', 'events', 'date-fns-tz', 'date-fns'],
    exclude: ['lucide-react'],
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    target: 'es2022',
    sourcemap: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // pdfjs / react-pdf touch Node's `stream`; Vite externalizes it unless polyfilled.
      stream: 'stream-browserify',
      buffer: 'buffer',
      events: path.resolve(__dirname, 'node_modules/events/events.js'),
      'date-fns-tz': path.resolve(
        __dirname,
        'node_modules/date-fns-tz/dist/esm/index.js',
      ),
    },
  },
});
