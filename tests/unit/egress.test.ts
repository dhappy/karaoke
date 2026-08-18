import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

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

/** Every text asset in the build, at any depth. */
const SCANNED = new Set(['.js', '.mjs', '.cjs', '.css', '.html', '.svg', '.json', '.webmanifest']);

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (SCANNED.has(extname(name))) out.push(full);
  }
  return out;
}

/**
 * Scans the WHOLE build, not just `dist/assets`.
 *
 * Anything in `public/` is copied verbatim into the build root — it is never
 * bundled, transformed, or linted. That makes it the one path by which a
 * third-party script could reach users without tripping any other guard, so a
 * check scoped to `dist/assets` would have a hole exactly where it matters most.
 */
function bundlePaths(): string[] {
  return walk(DIST);
}

function bundleSources(): string[] {
  return bundlePaths().map((f) => readFileSync(f, 'utf8'));
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
    // XML namespace and RDF vocabulary URIs are IDENTIFIERS, not endpoints — no
    // agent ever fetches them. SVG editors write them into metadata as a matter
    // of course, so treating any absolute URL as egress produces false positives
    // on perfectly ordinary artwork.
    const IDENTIFIER_HOSTS =
      /^https?:\/\/(localhost|127\.0\.0\.1|(www\.)?w3\.org|purl\.org|(www\.)?creativecommons\.org|(www\.)?inkscape\.org|sodipodi\.sourceforge\.net|svelte\.dev)/i;

    for (const src of bundleSources()) {
      const urls = src.match(/https?:\/\/[\w.-]+/gi) ?? [];
      expect(urls.filter((u) => !IDENTIFIER_HOSTS.test(u))).toEqual([]);
    }
  });

  it('static assets copied from public/ are covered by the same rules', () => {
    // Guard against the guard being narrowed back to dist/assets later: prove the
    // scan reaches files that did NOT come from the bundler. Deliberately not
    // pinned to a filename — public/ is the user's to fill.
    const scanned = bundlePaths().map((p) => p.replace(DIST, ''));
    const fromPublic = scanned.filter((p) => !p.startsWith('assets/') && p !== 'index.html');
    expect(fromPublic.length).toBeGreaterThan(0);
    expect(scanned.some((p) => p.startsWith('assets/'))).toBe(true);
  });

  it('ships no inline script outside the module entry point', () => {
    // A <script> inside a public/ SVG or HTML file would execute and is exactly
    // the sort of thing the CSP's script-src 'self' is meant to be paired with.
    for (const file of bundlePaths().filter((f) => /\.(svg|html)$/.test(f))) {
      const src = readFileSync(file, 'utf8');
      const scripts = src.match(/<script\b[^>]*>/gi) ?? [];
      for (const tag of scripts) {
        // The single legitimate script is the built module entry in index.html.
        expect(tag).toMatch(/type="module"/);
      }
      expect(src).not.toMatch(/\bon(load|click|error)\s*=/i);
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
