import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// `defineConfig` comes from vitest/config rather than vite: it is vite's config
// type widened with the `test` key. Importing vite's own defineConfig here type-
// errors under TypeScript 6+, which is correct — `test` was never part of it.
export default defineConfig({
  plugins: [svelte()],
  server: { port: 5173 },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
