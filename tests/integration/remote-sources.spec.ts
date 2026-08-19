import { test, expect, type Page } from '@playwright/test';
import { FIXTURE_ORIGIN } from '../../playwright.config.js';

/**
 * User Stories 1, 2 and 5 — loading from an address, mixing with a local file,
 * and paste routing.
 *
 * These run against a SECOND ORIGIN (a different localhost port), which is what
 * makes them real: `'self'` does not cover it, so the widened CSP and the CORS
 * asymmetry between <video src> and fetch are exercised rather than assumed.
 */

const VIDEO = `${FIXTURE_ORIGIN}/ok/tiny.webm`;
const LYRICS = `${FIXTURE_ORIGIN}/ok/word-timed.vtt`;

async function boot(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => '__karaoke' in window);
}

const lineCount = (page: Page) =>
  page.evaluate(() => window.__karaoke.state.lyrics.lines.length as number);

const videoReady = (page: Page) =>
  page.waitForFunction(() => {
    const v = document.querySelector('video') as HTMLVideoElement | null;
    return !!v && v.readyState >= 1;
  });

test.describe('User Story 1 — a pair from two addresses', () => {
  test('loads both sources and becomes ready to play', async ({ page }) => {
    await boot(page);
    await page.evaluate(
      ([v, l]) => {
        window.__karaoke.loadVideoAddress(v);
        return window.__karaoke.loadLyricsAddress(l);
      },
      [VIDEO, LYRICS] as const,
    );

    await videoReady(page);
    expect(await lineCount(page)).toBeGreaterThan(0);
    await expect(page.getByTestId('video-status')).toContainText(FIXTURE_ORIGIN);
    await expect(page.getByTestId('lyrics-status')).toContainText(FIXTURE_ORIGIN);
  });

  test('records the origin as a url, not a file', async ({ page }) => {
    await boot(page);
    await page.evaluate((l) => window.__karaoke.loadLyricsAddress(l), LYRICS);
    const origin = await page.evaluate(() => window.__karaoke.state.lyrics.origin);
    expect(origin).toEqual({ kind: 'url', href: LYRICS });
  });

  /**
   * SC-102 — the property that proves nothing downstream branches on origin.
   *
   * Same bytes, two routes in. If line selection or word onsets differed, some
   * code would be reading `origin.kind` on a path that must not.
   */
  test('produces identical lyrics to the same file loaded locally', async ({ page }) => {
    await boot(page);
    const viaAddress = await page.evaluate(async (l) => {
      await window.__karaoke.loadLyricsAddress(l);
      return JSON.stringify(window.__karaoke.state.lyrics.lines);
    }, LYRICS);

    const text = await (await fetch(LYRICS)).text();
    const viaFile = await page.evaluate((t) => {
      window.__karaoke.loadLyrics(t, 'word-timed.vtt');
      return JSON.stringify(window.__karaoke.state.lyrics.lines);
    }, text);

    expect(viaAddress).toBe(viaFile);
  });

  test('shows per-slot progress while loading', async ({ page }) => {
    await boot(page);
    // /delay/ answers after 1.5s, so the loading state is observable without
    // parking a socket the rest of the suite needs.
    await page.evaluate((o) => { void window.__karaoke.loadLyricsAddress(`${o}/delay/word-timed.vtt`); }, FIXTURE_ORIGIN);
    await expect(page.getByTestId('lyrics-status')).toContainText(/loading/i);
    // The other slot must not claim to be loading (FR-103, FR-107).
    await expect(page.getByTestId('video-status')).not.toContainText(/loading/i);
  });

  /**
   * FR-108 / SC-107 — the bug that passes every manual test and fails a race.
   */
  test('the newest request wins, and the abandoned one stays silent', async ({ page }) => {
    await boot(page);
    await page.evaluate(
      ([o, fast]) => {
        // Deliberately not awaited: the delayed one must still be in flight.
        void window.__karaoke.loadLyricsAddress(`${o}/delay/word-timed.vtt`);
        return window.__karaoke.loadLyricsAddress(fast);
      },
      [FIXTURE_ORIGIN, LYRICS] as const,
    );

    expect(await lineCount(page)).toBeGreaterThan(0);
    const loaded = await page.evaluate(() => window.__karaoke.state.lyrics.origin);
    expect(loaded).toEqual({ kind: 'url', href: LYRICS });

    // Give the abandoned attempt time to resolve and misbehave if it is going to.
    await page.waitForTimeout(1500);
    expect(await lineCount(page)).toBeGreaterThan(0);
    await expect(page.getByTestId('error')).toHaveCount(0);
  });
});

test.describe('User Story 2 — a local file mixed with an address', () => {
  test('pairs a local video with a lyric address', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.__karaoke.loadMedia('/tests/fixtures/tiny.webm'));
    await videoReady(page);
    await page.evaluate((l) => window.__karaoke.loadLyricsAddress(l), LYRICS);
    expect(await lineCount(page)).toBeGreaterThan(0);
  });

  test('replacing one slot leaves the other, and the offset, untouched', async ({ page }) => {
    await boot(page);
    await page.evaluate(
      ([v, l]) => {
        window.__karaoke.loadVideoAddress(v);
        return window.__karaoke.loadLyricsAddress(l);
      },
      [VIDEO, LYRICS] as const,
    );
    await videoReady(page);

    await page.evaluate(() => { window.__karaoke.state.media.offset = -0.4; });
    const before = await lineCount(page);

    // Swap only the video.
    await page.evaluate((o) => window.__karaoke.loadVideoAddress(`${o}/ok/busy.webm`), FIXTURE_ORIGIN);
    await videoReady(page);

    expect(await lineCount(page)).toBe(before);
    expect(await page.evaluate(() => window.__karaoke.state.media.offset)).toBe(-0.4);
  });

  /**
   * research D3 — the asymmetry that must never be collapsed.
   *
   * A media element may load cross-origin WITHOUT CORS; `fetch` may not. If both
   * fail together here, something has set `crossorigin` on the video element and
   * broken every video whose host does not send the header.
   */
  test('a no-CORS host plays as video but refuses as lyrics', async ({ page }) => {
    await boot(page);
    await page.evaluate((o) => window.__karaoke.loadVideoAddress(`${o}/no-cors/tiny.webm`), FIXTURE_ORIGIN);
    await videoReady(page);
    expect(await page.evaluate(() => window.__karaoke.state.media.status)).toBe('ready');

    await page.evaluate((o) => window.__karaoke.loadLyricsAddress(`${o}/no-cors/word-timed.vtt`), FIXTURE_ORIGIN);
    expect(await page.evaluate(() => window.__karaoke.state.lyrics.failure))
      .toBe('refused-or-unreachable');

    // The video is still fine — one slot failing must not mark the other.
    expect(await page.evaluate(() => window.__karaoke.state.media.status)).toBe('ready');
  });
});

test.describe('User Story 5 — paste routing', () => {
  test('routes a pasted lyric address to the lyrics slot, correctably', async ({ page }) => {
    await boot(page);
    await page.evaluate((l) => {
      const dt = new DataTransfer();
      dt.setData('text', l);
      document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }));
    }, LYRICS);

    await expect(page.getByTestId('routing-override')).toContainText(/lyrics/i);
    await page.waitForFunction(() => window.__karaoke.state.lyrics.lines.length > 0);
  });

  test('the override sends the same address to the other slot', async ({ page }) => {
    await boot(page);
    // A video address with no recognizable extension guesses "video"...
    await page.evaluate((o) => {
      const dt = new DataTransfer();
      dt.setData('text', `${o}/ok/word-timed.vtt`.replace('.vtt', '.vtt?x=1'));
      document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }));
    }, FIXTURE_ORIGIN);

    const override = page.getByTestId('routing-override');
    await expect(override).toBeVisible();
    await override.getByRole('button').click();
    await expect(override).toHaveCount(0);
  });
});

test.describe('FR-121 / SC-109 — offline is unbroken', () => {
  /**
   * Address support must be ADDITIVE. If a file-backed path has quietly grown a
   * dependency on the network, this is where it shows.
   *
   * The browser is genuinely taken offline rather than assumed to be: the page
   * is loaded first, then the connection is cut, and only then are local files
   * chosen. Anything that reaches for the network after that point fails.
   */
  test('local files still load and play with the network cut', async ({ page, context }) => {
    await boot(page);
    await context.setOffline(true);

    try {
      await page.getByTestId('video-input').setInputFiles('tests/fixtures/tiny.webm');
      await page.getByTestId('lyrics-input').setInputFiles('tests/fixtures/word-timed.vtt');

      await videoReady(page);
      expect(await lineCount(page)).toBeGreaterThan(0);
      expect(await page.evaluate(() => window.__karaoke.state.media.status)).toBe('ready');
      await expect(page.getByTestId('error')).toHaveCount(0);
    } finally {
      await context.setOffline(false);
    }
  });
});

test.describe('Constitution II — contacts only what it was given', () => {
  /**
   * FR-117 / SC-108. The product may fetch an address the person typed. It may
   * not contact anything else, ever — no analytics, no preflight to a third
   * party, no "helpful" probe.
   */
  test('makes no request to any address the person did not supply', async ({ page }) => {
    const contacted = new Set<string>();
    page.on('request', (r) => contacted.add(new URL(r.url()).origin));

    await boot(page);
    await page.evaluate(
      ([v, l]) => {
        window.__karaoke.loadVideoAddress(v);
        return window.__karaoke.loadLyricsAddress(l);
      },
      [VIDEO, LYRICS] as const,
    );
    await videoReady(page);

    // ...and a failing load must not contact anything extra either.
    await page.evaluate((o) => window.__karaoke.loadLyricsAddress(`${o}/404/x.vtt`), FIXTURE_ORIGIN);

    const allowed = new Set(['http://localhost:5173', FIXTURE_ORIGIN]);
    expect([...contacted].filter((o) => !allowed.has(o))).toEqual([]);
  });
});
