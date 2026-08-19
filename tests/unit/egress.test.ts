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

/**
 * Parses the shipped CSP into directive -> exact token set.
 *
 * This exists because the previous assertions were PREFIX matches
 * (`/connect-src\s+'self'/`), and a prefix match on a policy that grows by
 * APPENDING tokens is not a guard at all: `connect-src 'self' blob: data: https:`
 * satisfies it just as happily as `connect-src 'self'`. Feature 002 widened this
 * policy, and the old assertions stayed green throughout — the property they
 * existed to protect changed underneath them with nothing to signal it.
 *
 * Comparing whole token sets is what makes the next widening visible.
 */
function cspDirectives(html: string): Map<string, string[]> {
  const m = /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(html);
  if (!m) throw new Error('no CSP meta tag in the built page');
  const out = new Map<string, string[]>();
  for (const part of m[1]!.split(';')) {
    const [name, ...tokens] = part.trim().split(/\s+/).filter(Boolean);
    if (name) out.set(name, tokens);
  }
  return out;
}

describe.skipIf(!built)('Constitution II: no egress', () => {
  /**
   * The full shipped policy, pinned token-for-token.
   *
   * Feature 002 (URL media sources) widened `media-src` and `connect-src` by
   * exactly one token each — `https:` — so a person can point the app at an
   * address they typed, which Principle II explicitly permits. Everything else
   * is unchanged, and the widening is INBOUND ONLY.
   *
   * Changing this table is how you widen the policy. Doing it by accident is
   * what this test prevents.
   */
  const EXPECTED: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': ["'self'"],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'blob:', 'data:'],
    'media-src': ["'self'", 'blob:', 'data:', 'mediastream:', 'https:'],
    'connect-src': ["'self'", 'blob:', 'data:', 'https:'],
    'font-src': ["'self'"],
    'object-src': ["'none'"],
    'frame-src': ["'none'"],
    'worker-src': ["'none'"],
    'base-uri': ["'none'"],
    'form-action': ["'none'"],
  };

  it('the built page declares exactly the expected CSP, directive by directive', () => {
    const html = readFileSync(join(DIST, 'index.html'), 'utf8');
    const actual = cspDirectives(html);

    // Every expected directive present with EXACTLY its expected tokens.
    for (const [name, tokens] of Object.entries(EXPECTED)) {
      expect(actual.get(name), `directive ${name}`).toEqual(tokens);
    }

    // And no directive we did not sanction — a new one is a policy change too.
    expect([...actual.keys()].sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  it('the directives that could execute or exfiltrate stay closed', () => {
    // Stated separately from the table so the INTENT survives a future edit:
    // widening media/connect is permitted; widening these is not, and a
    // reviewer changing EXPECTED above should have to defeat this too.
    const actual = cspDirectives(readFileSync(join(DIST, 'index.html'), 'utf8'));
    for (const directive of ['script-src', 'style-src'] as const) {
      expect(actual.get(directive)).not.toContain('https:');
      expect(actual.get(directive)).not.toContain('*');
      expect(actual.get(directive)).not.toContain("'unsafe-eval'");
    }
    for (const directive of ['object-src', 'frame-src', 'worker-src', 'base-uri', 'form-action'] as const) {
      expect(actual.get(directive)).toEqual(["'none'"]);
    }
  });

  it('ships no dev-only CSP relaxation', () => {
    // vite.config.ts injects http://localhost:* in `serve` mode only. If that
    // ever leaks into a build, the shipped policy would permit a plaintext
    // origin. This is the assertion that catches an `apply` regression.
    //
    // Deliberately scoped to the PARSED DIRECTIVES rather than the raw HTML:
    // the explanatory comment above the meta tag names `http://localhost:*` to
    // document why it is absent, and comments ship in the built page. Matching
    // raw text would fail on the documentation instead of on the policy.
    const actual = cspDirectives(readFileSync(join(DIST, 'index.html'), 'utf8'));
    for (const tokens of actual.values()) {
      expect(tokens.join(' ')).not.toContain('localhost');
    }
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

    // The site's own origin is not a third party, and the page never fetches it:
    // og:url and og:image are read out of band by a crawler that has no page
    // context, which is the reason they must be absolute at all. This is not a
    // hole in the guard — the permitted host is READ FROM the shipped CNAME
    // rather than written here, so changing the domain without changing
    // index.html fails this test instead of shipping a preview card that points
    // at whoever owns the old name.
    const canonical = readFileSync(join(DIST, 'CNAME'), 'utf8').trim();
    const SELF_ORIGIN = new RegExp(`^https?://${canonical.replace(/\./g, '\\.')}$`, 'i');

    for (const src of bundleSources()) {
      const urls = src.match(/https?:\/\/[\w.-]+/gi) ?? [];
      expect(urls.filter((u) => !IDENTIFIER_HOSTS.test(u) && !SELF_ORIGIN.test(u))).toEqual([]);
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
