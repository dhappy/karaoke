import { test, expect, type Page } from '@playwright/test';

/**
 * User Story 2 — self-service loading, and the failure paths that must never
 * destroy working state.
 */

async function boot(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => '__karaoke' in window);
}

async function fixtureText(name: string): Promise<string> {
  const res = await fetch(`http://localhost:5173/tests/fixtures/${name}`);
  return res.text();
}

async function loadPair(page: Page, vttName: string) {
  const vtt = await fixtureText(vttName);
  await page.evaluate(
    ([text, name]) => {
      const api = window.__karaoke;
      api.loadMedia('/tests/fixtures/tiny.webm');
      api.loadLyrics(text, name);
    },
    [vtt, vttName] as const,
  );
  await page.waitForFunction(() => {
    const v = document.querySelector('video') as HTMLVideoElement | null;
    return !!v && v.readyState >= 1;
  });
}

const lineCount = (page: Page) =>
  page.evaluate(() => window.__karaoke.state.lyrics.lines.length as number);

test.describe('User Story 2 — loading', () => {
  test('exposes both a picker and a drop target', async ({ page }) => {
    await boot(page);
    await expect(page.getByTestId('video-input')).toBeAttached();
    await expect(page.getByTestId('lyrics-input')).toBeAttached();
    await expect(page.getByRole('region', { name: /choose a video/i })).toBeVisible();
  });

  test('accepts a video and a lyric file and becomes ready to play', async ({ page }) => {
    await boot(page);
    await loadPair(page, 'word-timed.vtt');
    expect(await lineCount(page)).toBe(3);
    const state = await page.evaluate(() => {
      const s = window.__karaoke.state;
      return { media: s.media.status, lyrics: s.lyrics.status };
    });
    expect(state).toEqual({ media: 'ready', lyrics: 'ready' });
  });

  test('FR-022: replaces lyrics without reloading the video', async ({ page }) => {
    await boot(page);
    await loadPair(page, 'word-timed.vtt');

    const before = await page.evaluate(() => {
      const v = document.querySelector('video') as HTMLVideoElement;
      v.currentTime = 6;
      return v.src;
    });

    const other = await fixtureText('overlapping.vtt');
    await page.evaluate((t) => window.__karaoke.loadLyrics(t, 'overlapping.vtt'), other);

    const after = await page.evaluate(() => {
      const v = document.querySelector('video') as HTMLVideoElement;
      return { src: v.src, time: v.currentTime };
    });

    expect(after.src).toBe(before);       // same media element, same source
    expect(after.time).toBeCloseTo(6, 1); // playback position undisturbed
    expect(await lineCount(page)).toBe(3);
  });

  test('FR-020: a repairable file loads, plays, and reports warnings', async ({ page }) => {
    await boot(page);
    await loadPair(page, 'malformed.vtt');

    expect(await lineCount(page)).toBeGreaterThan(0);
    await expect(page.getByTestId('warning')).toBeVisible();
    await expect(page.getByTestId('error')).toHaveCount(0);
  });

  test('FR-021: a bad lyric file leaves previously loaded lyrics usable', async ({ page }) => {
    await boot(page);
    await loadPair(page, 'word-timed.vtt');
    const good = await lineCount(page);
    expect(good).toBe(3);

    // Not WebVTT at all.
    await page.evaluate(() =>
      window.__karaoke.loadLyrics('this is a shopping list\nmilk\neggs', 'notes.txt'),
    );

    await expect(page.getByTestId('error')).toBeVisible();
    // THE CLAUSE MOST LIKELY TO REGRESS: the good lyrics survive.
    expect(await lineCount(page)).toBe(good);

    const stillWorks = await page.evaluate(async () => {
      const v = document.querySelector('video') as HTMLVideoElement;
      v.pause();
      v.currentTime = 2.0;
      await new Promise<void>((r) => v.addEventListener('seeked', () => r(), { once: true }));
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      await new Promise<void>((r) => setTimeout(r, 0));
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      return document.querySelectorAll('[data-emphasis="active"] [data-word]').length;
    });
    expect(stillWorks).toBeGreaterThan(0);
  });

  test('an empty-but-valid lyric file loads with no overlay and no error', async ({ page }) => {
    await boot(page);
    await loadPair(page, 'empty.vtt');
    expect(await lineCount(page)).toBe(0);
    await expect(page.getByTestId('error')).toHaveCount(0);
  });

  test('FR-021: a media file the browser cannot play reports plain language', async ({ page }) => {
    await boot(page);
    // A .vtt is not media in any format the browser decodes.
    await page.evaluate(() => window.__karaoke.loadMedia('/tests/fixtures/word-timed.vtt'));
    const banner = page.getByTestId('error');
    await expect(banner).toBeVisible();
    const text = await banner.textContent();
    // Plain language, not a raw MediaError code.
    expect(text).toMatch(/cannot play|damaged|could not be/i);
    expect(text).not.toMatch(/MEDIA_ERR|code\s*[:=]\s*\d/);
  });

  test('messages can be dismissed without disturbing playback', async ({ page }) => {
    await boot(page);
    await loadPair(page, 'malformed.vtt');
    await expect(page.getByTestId('banner')).toBeVisible();
    await page.getByRole('button', { name: /dismiss/i }).click();
    await expect(page.getByTestId('banner')).toHaveCount(0);
    expect(await lineCount(page)).toBeGreaterThan(0);
  });
});
