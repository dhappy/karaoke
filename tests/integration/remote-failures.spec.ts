import { test, expect, type Page } from '@playwright/test';
import { FIXTURE_ORIGIN } from '../../playwright.config.js';

/**
 * User Story 3 — every failure names itself, and nothing that was playing stops.
 *
 * The survival assertions matter more than the wording ones: a message that is
 * merely imperfect is a papercut, but a failed load that destroys a working
 * pairing is the difference between a tool and a toy (FR-112, SC-104).
 */

const VIDEO = `${FIXTURE_ORIGIN}/ok/tiny.webm`;
const LYRICS = `${FIXTURE_ORIGIN}/ok/word-timed.vtt`;

async function boot(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => '__karaoke' in window);
}

async function loadWorkingPair(page: Page) {
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

const lyricsFailure = (page: Page) =>
  page.evaluate(() => window.__karaoke.state.lyrics.failure);

test.describe('failures decidable before any request (FR-105)', () => {
  test('rejects unusable text without contacting anything', async ({ page }) => {
    await boot(page);
    const requests: string[] = [];
    page.on('request', (r) => requests.push(r.url()));

    await page.evaluate(() => window.__karaoke.loadLyricsAddress('not a url'));
    expect(await lyricsFailure(page)).toBe('unusable-address');
    expect(requests.filter((u) => !u.startsWith('http://localhost:5173'))).toEqual([]);
  });

  test('names a streaming page rather than failing generically (FR-114)', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.__karaoke.loadLyricsAddress('https://www.youtube.com/watch?v=abc'));
    expect(await lyricsFailure(page)).toBe('streaming-page');
    await expect(page.getByTestId('error')).toContainText(/video site/i);
    await expect(page.getByTestId('error')).toContainText(/direct address/i);
  });

  test('refuses a javascript: address outright', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.__karaoke.loadLyricsAddress('javascript:alert(1)'));
    expect(await lyricsFailure(page)).toBe('unusable-address');
  });
});

test.describe('failures decidable only from the attempt (FR-110)', () => {
  const cases = [
    { route: 'no-cors', failure: 'refused-or-unreachable', reads: /may not allow|unreachable/i },
    { route: '404', failure: 'not-found', reads: /nothing at that address/i },
    { route: '403', failure: 'forbidden', reads: /permission/i },
    { route: 'html', failure: 'unreadable-lyrics', reads: /not readable as lyrics|WebVTT/i },
  ] as const;

  for (const { route, failure, reads } of cases) {
    test(`/${route}/ reports ${failure} in plain language`, async ({ page }) => {
      await boot(page);
      await page.evaluate(
        (url) => window.__karaoke.loadLyricsAddress(url),
        `${FIXTURE_ORIGIN}/${route}/word-timed.vtt`,
      );
      expect(await lyricsFailure(page)).toBe(failure);
      await expect(page.getByTestId('error')).toContainText(reads);
    });
  }

  test('a redirect resolves without troubling the person', async ({ page }) => {
    await boot(page);
    await page.evaluate(
      (url) => window.__karaoke.loadLyricsAddress(url),
      `${FIXTURE_ORIGIN}/redirect/word-timed.vtt`,
    );
    expect(await page.evaluate(() => window.__karaoke.state.lyrics.lines.length)).toBeGreaterThan(0);
    await expect(page.getByTestId('error')).toHaveCount(0);
  });

  test('gives up on a hanging address rather than waiting forever (SC-106)', async ({ page }) => {
    await boot(page);
    // The shipped deadline is 20s; the spec timeout is 60s, so this is honest
    // rather than a stub — it really waits for the real bound.
    await page.evaluate(
      (url) => window.__karaoke.loadLyricsAddress(url),
      `${FIXTURE_ORIGIN}/slow/word-timed.vtt`,
    );
    expect(await lyricsFailure(page)).toBe('timed-out');
  });
});

test.describe('FR-112 / SC-104 — a failure destroys nothing', () => {
  const breakers = [
    'not a url',
    'https://www.youtube.com/watch?v=abc',
    `${FIXTURE_ORIGIN}/no-cors/word-timed.vtt`,
    `${FIXTURE_ORIGIN}/404/word-timed.vtt`,
    `${FIXTURE_ORIGIN}/403/word-timed.vtt`,
    `${FIXTURE_ORIGIN}/html/word-timed.vtt`,
  ];

  test('every lyric failure leaves the loaded pair playing', async ({ page }) => {
    await boot(page);
    await loadWorkingPair(page);

    const before = await page.evaluate(() => ({
      lines: window.__karaoke.state.lyrics.lines.length,
      origin: JSON.stringify(window.__karaoke.state.lyrics.origin),
      mediaStatus: window.__karaoke.state.media.status,
    }));
    await page.evaluate(() => { window.__karaoke.state.media.offset = -0.4; });

    for (const bad of breakers) {
      await page.evaluate((url) => window.__karaoke.loadLyricsAddress(url), bad);

      const after = await page.evaluate(() => ({
        lines: window.__karaoke.state.lyrics.lines.length,
        origin: JSON.stringify(window.__karaoke.state.lyrics.origin),
        mediaStatus: window.__karaoke.state.media.status,
        offset: window.__karaoke.state.media.offset,
      }));

      expect(after.lines, bad).toBe(before.lines);
      expect(after.origin, bad).toBe(before.origin);
      expect(after.mediaStatus, bad).toBe(before.mediaStatus);
      expect(after.offset, bad).toBe(-0.4);
    }
  });

  /**
   * The task the plan flagged as reading correct while being wrong.
   *
   * Assigning <video src> is DESTRUCTIVE: the old source is gone the instant the
   * assignment happens. Without an explicit reinstatement, replacing a working
   * video with a broken address leaves the person with a blank stage — and the
   * naive implementation looks entirely reasonable.
   */
  test('a failed video replacement puts the working video back', async ({ page }) => {
    await boot(page);
    await loadWorkingPair(page);
    const before = await page.evaluate(() => JSON.stringify(window.__karaoke.state.media.origin));

    await page.evaluate(
      (url) => window.__karaoke.loadVideoAddress(url),
      `${FIXTURE_ORIGIN}/404/nothing-here.webm`,
    );

    await page.waitForFunction(() => window.__karaoke.state.media.error !== null);

    // Told what happened — and the message must SURVIVE the reinstated video's
    // own successful load, which calls succeed() and clears `error`. A message
    // that flashes and vanishes leaves the person watching their old video
    // reappear with no explanation.
    await expect(page.getByTestId('error')).toBeVisible();
    await page.waitForTimeout(1000);
    await expect(page.getByTestId('error')).toBeVisible();

    // ...and still holding the video that was working, USABLE rather than
    // merely present: the failure belonged to the address that was tried, not
    // to the source that survived it.
    expect(await page.evaluate(() => JSON.stringify(window.__karaoke.state.media.origin))).toBe(before);
    expect(await page.evaluate(() => window.__karaoke.state.media.status)).toBe('ready');
    expect(await page.evaluate(() => document.querySelector('video')?.getAttribute('src'))).toContain('tiny.webm');
    expect(await page.evaluate(() => (document.querySelector('video') as HTMLVideoElement).readyState)).toBeGreaterThanOrEqual(1);
  });
});

test.describe('FR-111 — no untrusted text reaches the screen', () => {
  test('messages carry no status codes, exception text, or addresses', async ({ page }) => {
    await boot(page);
    for (const bad of [
      `${FIXTURE_ORIGIN}/404/word-timed.vtt`,
      `${FIXTURE_ORIGIN}/403/word-timed.vtt`,
      `${FIXTURE_ORIGIN}/html/word-timed.vtt`,
      'https://www.youtube.com/watch?v=abc',
    ]) {
      await page.evaluate((url) => window.__karaoke.loadLyricsAddress(url), bad);
      const text = (await page.getByTestId('error').first().textContent()) ?? '';
      expect(text, bad).not.toMatch(/\b(404|403|401|500)\b/);
      expect(text, bad).not.toMatch(/TypeError|Failed to fetch|<html|<!doctype/i);
      expect(text, bad).not.toContain('http://');
      expect(text, bad).not.toContain('https://');
    }
  });
});
