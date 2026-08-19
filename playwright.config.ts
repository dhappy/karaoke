import { defineConfig } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';

/**
 * This machine has no root, so `playwright install --with-deps` cannot install
 * Chromium's shared libraries system-wide. scripts/fetch-browser-libs.sh
 * extracts them into a local prefix and records the path in .env.test; we
 * prepend it to LD_LIBRARY_PATH here so the browser launches.
 * On a machine with the system packages present, .env.test is simply absent.
 */
if (existsSync('.env.test')) {
  for (const line of readFileSync('.env.test', 'utf8').split('\n')) {
    const m = /^CHROMIUM_LIB_PATH=(.*)$/.exec(line.trim());
    if (m?.[1]) process.env.LD_LIBRARY_PATH = `${m[1]}:${process.env.LD_LIBRARY_PATH ?? ''}`;
  }
}

/** Kept in one place: the fixture origin's port is referenced by tests too. */
export const FIXTURE_PORT = Number(process.env.FIXTURE_PORT ?? 5174);
export const FIXTURE_ORIGIN = `http://localhost:${FIXTURE_PORT}`;

export default defineConfig({
  testDir: './tests/integration',
  fullyParallel: true,
  workers: 2,
  reporter: 'list',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  webServer: [
    {
      command: 'pnpm dev',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    /**
     * Second origin for remote-source tests (research D11). A different PORT is a
     * different ORIGIN, which is the point: `'self'` does not cover it, so the
     * widened CSP and the CORS asymmetry between <video src> and fetch are
     * exercised rather than assumed.
     */
    {
      command: 'node --experimental-strip-types tests/fixtures/server.ts',
      url: `http://localhost:${FIXTURE_PORT}/ok/empty.vtt`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
});
