import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// `defineConfig` comes from vitest/config rather than vite: it is vite's config
// type widened with the `test` key. Importing vite's own defineConfig here type-
// errors under TypeScript 6+, which is correct — `test` was never part of it.
export default defineConfig({
  plugins: [svelte()],

  /**
   * Asset base path. This is the one setting that silently breaks a GitHub Pages
   * deploy, so it is explicit rather than defaulted.
   *
   *   '/'          — correct HERE, because public/CNAME serves the site from the
   *                  root of a custom domain (sing.gaian.church).
   *   '/karaoke/'  — what it would have to become if the CNAME were removed and
   *                  the site fell back to dhappy.github.io/karaoke. Without that
   *                  change every asset 404s while index.html loads fine, which
   *                  presents as a blank page with no obvious cause.
   */
  base: '/',

  build: {
    outDir: 'dist',
    // Fail loudly rather than shipping a half-written directory.
    emptyOutDir: true,
    // public/ ships verbatim: CNAME and .nojekyll have to reach the branch root.
    copyPublicDir: true,
    sourcemap: false,
  },

  server: { port: 5173 },

  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
