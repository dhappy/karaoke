import { test, expect, type Page } from '@playwright/test';
import { FIXTURE_ORIGIN } from '../../playwright.config.js';

/**
 * User Story 4 — the share link.
 *
 * The load-bearing test in this file is "discloses nothing to any server"
 * (FR-124, SC-111). It is the Constitution II check for this feature: if the
 * payload reaches a server, the feature does not ship, however well the rest
 * works.
 */

const VIDEO = `${FIXTURE_ORIGIN}/ok/tiny.webm`;
const LYRICS = `${FIXTURE_ORIGIN}/ok/word-timed.vtt`;

async function boot(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => '__karaoke' in window);
}

async function loadPairFromAddresses(page: Page) {
  await page.evaluate(
    ([v, l]) => {
      window.__karaoke.loadVideoAddress(v);
      return window.__karaoke.loadLyricsAddress(l);
    },
    [VIDEO, LYRICS] as const,
  );
  await page.waitForFunction(() => {
    const v = document.querySelector('video') as HTMLVideoElement | null;
    return !!v && v.readyState >= 1 && window.__karaoke.state.lyrics.lines.length > 0;
  });
}

test.describe('FR-122 / FR-123 — round trip', () => {
  test('reflects loaded addresses into the fragment', async ({ page }) => {
    await boot(page);
    await loadPairFromAddresses(page);
    const hash = await page.evaluate(() => location.hash);
    expect(hash).toContain('v=');
    expect(hash).toContain('l=');
  });

  /**
   * SC-110 — with a NON-ZERO offset, deliberately.
   *
   * The zero case passes even when the offset is dropped entirely, so testing
   * only that would hide exactly the regression this exists to catch.
   */
  test('restores both sources and the offset from a link', async ({ page }) => {
    await boot(page);
    await loadPairFromAddresses(page);
    // Through the same path OffsetControl uses. Writing `media.offset` directly
    // would change the offset without ever reflecting it, which is correct
    // behaviour (only a settled, deliberate change updates the link) but would
    // make this test assert nothing.
    await page.evaluate(() => window.__karaoke.state.sources.offsetChanged(-0.4));
    // The offset write is debounced before it reaches the fragment.
    await page.waitForFunction(() => location.hash.includes('o=-0.4'));

    const shared = await page.evaluate(() => location.href);

    // A genuinely fresh page, not a soft reset.
    await page.goto(shared);
    await page.waitForFunction(() => '__karaoke' in window);
    await page.waitForFunction(() => window.__karaoke.state.lyrics.lines.length > 0);

    expect(await page.evaluate(() => window.__karaoke.state.media.offset)).toBe(-0.4);
    expect(await page.evaluate(() => JSON.stringify(window.__karaoke.state.lyrics.origin)))
      .toContain(LYRICS);
    expect(await page.evaluate(() => JSON.stringify(window.__karaoke.state.media.origin)))
      .toContain(VIDEO);
  });
});

test.describe('FR-124 / SC-111 — the link reaches no server', () => {
  /**
   * The Constitution II test.
   *
   * Had the pairing ridden in a query string, every opened link would have
   * written what that person was about to sing into the access logs of the host
   * serving the app — a host they never named. The fragment is the one part of a
   * URL browsers keep to themselves.
   */
  test('no request line or referrer carries any part of the pairing', async ({ page }) => {
    await boot(page);
    await loadPairFromAddresses(page);
    const shared = await page.evaluate(() => location.href);
    expect(shared).toContain('#');

    const leaks: string[] = [];
    page.on('request', (r) => {
      const url = r.url();
      // The pairing must appear in NO request line...
      if (url.includes('word-timed.vtt') && !url.startsWith(FIXTURE_ORIGIN)) leaks.push(`url:${url}`);
      if (/[?&](v|l|o)=/.test(url)) leaks.push(`query:${url}`);
      // ...and in no Referer header either.
      const referer = r.headers()['referer'];
      if (referer && (referer.includes('word-timed') || referer.includes('tiny.webm'))) {
        leaks.push(`referer:${referer}`);
      }
    });

    await page.goto(shared);
    await page.waitForFunction(() => '__karaoke' in window);
    await page.waitForFunction(() => window.__karaoke.state.lyrics.lines.length > 0);

    expect(leaks).toEqual([]);
  });

  test('the app document itself is requested without the payload', async ({ page }) => {
    await boot(page);
    await loadPairFromAddresses(page);
    const shared = await page.evaluate(() => location.href);

    const documentUrls: string[] = [];
    page.on('request', (r) => {
      if (r.resourceType() === 'document') documentUrls.push(r.url());
    });

    await page.goto(shared);
    await page.waitForFunction(() => '__karaoke' in window);

    for (const url of documentUrls) {
      expect(url).not.toContain('#');
      expect(url).not.toContain('v=');
      expect(url).not.toContain('l=');
    }
  });
});

test.describe('FR-131 / SC-112 — the address bar behaves', () => {
  test('source changes never reload the page or stack history entries', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
      (window as unknown as { __marker: number }).__marker = 42;
    });

    const depthBefore = await page.evaluate(() => history.length);

    for (let i = 0; i < 5; i++) {
      await page.evaluate(
        ([v, l]) => {
          window.__karaoke.loadVideoAddress(v);
          return window.__karaoke.loadLyricsAddress(l);
        },
        [VIDEO, LYRICS] as const,
      );
    }

    // A reload would have wiped this.
    expect(await page.evaluate(() => (window as unknown as { __marker?: number }).__marker)).toBe(42);
    expect(await page.evaluate(() => history.length)).toBe(depthBefore);
  });
});

test.describe('FR-129 / FR-130 — hostile and partial links', () => {
  const fragments = [
    '#v=javascript:alert(1)',
    '#l=%00%01%02',
    '#v=&l=&o=NaN',
    '#o=99999',
    '#%%%%',
  ];

  for (const fragment of fragments) {
    test(`survives ${fragment}`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(String(e)));

      await page.goto('/');
      await page.waitForFunction(() => '__karaoke' in window);
      await page.evaluate((f) => window.__karaoke.restoreFromLink(f), fragment);

      // Never throws, never blanks, never executes.
      expect(errors).toEqual([]);
      await expect(page.getByRole('region', { name: /choose a video/i })).toBeVisible();
      const offset = await page.evaluate(() => window.__karaoke.state.media.offset);
      expect(Number.isFinite(offset)).toBe(true);
      expect(Math.abs(offset)).toBeLessThanOrEqual(600);
    });
  }

  test('loads the recognized half of a link whose other half is unusable', async ({ page }) => {
    await boot(page);
    await page.evaluate(
      (l) => window.__karaoke.restoreFromLink(`#v=javascript:alert(1)&l=${encodeURIComponent(l)}`),
      LYRICS,
    );
    expect(await page.evaluate(() => window.__karaoke.state.lyrics.lines.length)).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.__karaoke.state.media.origin)).toBeNull();
  });

  test('announces the addresses a link will contact, as text', async ({ page }) => {
    await boot(page);
    // /delay/ keeps the announcement on screen long enough to assert against.
    const delayed = `${FIXTURE_ORIGIN}/delay/word-timed.vtt`;
    await page.evaluate((l) => { void window.__karaoke.restoreFromLink(`#l=${encodeURIComponent(l)}`); }, delayed);

    const announced = page.getByTestId('announced-address').first();
    await expect(announced).toContainText(FIXTURE_ORIGIN);
    // FR-129: rendered as text, never as a followable link.
    expect(await announced.evaluate((el) => el.querySelector('a'))).toBeNull();
  });
});

test.describe('FR-127 / SC-113 — completeness is declared', () => {
  test('a mixed pair reports the link as partial', async ({ page }) => {
    await boot(page);
    // A GENUINE local file, not the `loadMedia` seam: that seam records a url
    // origin, so it would produce a complete link and quietly pass a test meant
    // to prove the opposite.
    await page.getByTestId('video-input').setInputFiles('tests/fixtures/tiny.webm');
    await page.evaluate((l) => window.__karaoke.loadLyricsAddress(l), LYRICS);
    await expect(page.getByTestId('link-partial')).toContainText(/video/i);
  });

  test('two local files refuse to produce a link', async ({ page }) => {
    await boot(page);
    await expect(page.getByTestId('link-empty')).toBeVisible();
    await page.getByTestId('copy-link').click();
    await expect(page.getByTestId('share-note')).toContainText(/nothing to share/i);
  });
});
