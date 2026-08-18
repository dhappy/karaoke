import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Constitution II — The Device Is the Boundary.
 *
 * A principle no test can fail is only a preference. This is the test that can
 * fail it: it asserts the shipped bundle contains no analytics, no telemetry, and
 * no third-party origin, and that the page ships a CSP forbidding egress.
 *
 * Run `pnpm build` before this suite; it skips with an explicit message rather
 * than passing vacuously if dist/ is absent.
 */

const DIST = new URL('../../dist/', import.meta.url).pathname;
const built = existsSync(DIST);

function bundleSources(): string[] {
  const assets = join(DIST, 'assets');
  const files = existsSync(assets) ? readdirSync(assets) : [];
  return files
    .filter((f) => f.endsWith('.js') || f.endsWith('.css'))
    .map((f) => readFileSync(join(assets, f), 'utf8'));
}

describe.skipIf(!built)('Constitution II: no egress', () => {
  it('the built page declares a CSP that permits no third-party connection', () => {
    const html = readFileSync(join(DIST, 'index.html'), 'utf8');
    expect(html).toContain('Content-Security-Policy');
    expect(html).toMatch(/connect-src\s+'self'/);
    expect(html).toMatch(/object-src\s+'none'/);
    expect(html).toMatch(/form-action\s+'none'/);
  });

  it('ships no analytics or telemetry vendor', () => {
    const forbidden = [
      'google-analytics', 'googletagmanager', 'gtag(', 'segment.com',
      'mixpanel', 'amplitude', 'sentry.io', 'bugsnag', 'datadoghq',
      'hotjar', 'fullstory', 'posthog', 'plausible.io', 'matomo',
    ];
    for (const src of bundleSources()) {
      for (const needle of forbidden) {
        expect(src.toLowerCase()).not.toContain(needle);
      }
    }
  });

  it('contains no absolute third-party URL', () => {
    for (const src of bundleSources()) {
      const urls = src.match(/https?:\/\/[\w.-]+/gi) ?? [];
      const external = urls.filter(
        (u) => !/^https?:\/\/(localhost|127\.0\.0\.1|(www\.)?w3\.org|svelte\.dev)/i.test(u),
      );
      expect(external).toEqual([]);
    }
  });

  it('opens no socket or beacon', () => {
    for (const src of bundleSources()) {
      expect(src).not.toMatch(/new\s+WebSocket\s*\(/);
      expect(src).not.toMatch(/navigator\.sendBeacon/);
      expect(src).not.toMatch(/new\s+EventSource\s*\(/);
    }
  });
});

describe.skipIf(built)('build required', () => {
  it('reports that dist/ is missing rather than passing vacuously', () => {
    expect(built, 'run `pnpm build` before this suite').toBe(true);
  });
});
