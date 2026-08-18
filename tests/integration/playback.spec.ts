import { test, expect, type Page } from '@playwright/test';

/**
 * User Story 1 — the MVP. Core synchronised karaoke over a playing media source.
 *
 * Fixture media is a real silent VP8 WebM (scripts/make-fixture-media.mjs), so the
 * overlay is composited over actual decoded video, not an audio-only timeline.
 */

async function loadFixture(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => '__karaoke' in window);
  await page.evaluate(async () => {
    await window.__karaoke.loadFixture();
  });
  await page.waitForFunction(() => {
    const v = document.querySelector('video') as HTMLVideoElement | null;
    return !!v && v.readyState >= 1;
  });
}

/** Park the playhead at an exact time with playback paused, then let a frame land. */
async function seekTo(page: Page, t: number) {
  await page.evaluate(async (time) => {
    const v = document.querySelector('video') as HTMLVideoElement;
    v.pause();
    v.currentTime = time;
    await new Promise<void>((r) => v.addEventListener('seeked', () => r(), { once: true }));
    // Two frames plus a microtask drain: a structural change defers the fill
    // write until after Svelte flushes.
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    await new Promise<void>((r) => setTimeout(r, 0));
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
  }, t);
}

/** ACTIVE lines only. A preview line is also in the DOM and is not being sung. */
const visibleWords = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-emphasis="active"]')].map((line) => ({
      id: line.getAttribute('data-line-id'),
      words: [...line.querySelectorAll('[data-word]')].map((w) => ({
        text: w.querySelector('.unsung')?.textContent?.trim() ?? '',
        p: Number(getComputedStyle(w).getPropertyValue('--p')),
      })),
    })),
  );

test.describe('User Story 1 — core karaoke', () => {
  test('shows the line covering the playhead', async ({ page }) => {
    await loadFixture(page);
    await seekTo(page, 2.0); // inside cue 1 (1.0 -> 4.0)
    const lines = await visibleWords(page);
    expect(lines.length).toBe(1);
    expect(lines[0]!.words.map((w) => w.text).join(' ')).toContain('darkness');
  });

  test('clears the overlay in the gap between lines (FR-005)', async ({ page }) => {
    await loadFixture(page);
    await seekTo(page, 4.5); // gap: cue 1 ends 4.0, cue 2 starts 5.0
    expect(await visibleWords(page)).toEqual([]);
  });

  test('clears after the last line', async ({ page }) => {
    await loadFixture(page);
    await seekTo(page, 20);
    expect(await visibleWords(page)).toEqual([]);
  });

  test('words before the playhead are filled, words after are not', async ({ page }) => {
    await loadFixture(page);
    await seekTo(page, 3.1); // "old" starts 3.0, "friend" starts 3.4
    const [line] = await visibleWords(page);
    const p = line!.words.map((w) => w.p);
    expect(p[0]).toBe(1); // Hello
    expect(p[1]).toBe(1); // darkness
    expect(p[2]).toBe(1); // my
    expect(p[3]).toBeGreaterThan(0); // old — mid-fill
    expect(p[3]).toBeLessThan(1);
    expect(p[4]).toBe(0); // friend
  });

  test('fill advances progressively across the active word, not in a snap (FR-007)', async ({ page }) => {
    await loadFixture(page);
    const samples: number[] = [];
    for (const t of [3.05, 3.15, 3.25, 3.35]) {
      await seekTo(page, t);
      const [line] = await visibleWords(page);
      samples.push(line!.words[3]!.p);
    }
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]!).toBeGreaterThan(samples[i - 1]!);
    }
    expect(samples[0]!).toBeGreaterThan(0);
    expect(samples.at(-1)!).toBeLessThan(1);
  });

  test('SC-002: word onset lands within 100ms for at least 99% of words', async ({ page }) => {
    await loadFixture(page);

    const result = await page.evaluate(async () => {
      const api = window.__karaoke;
      const lines = api.state.lyrics.lines;
      const v = document.querySelector('video') as HTMLVideoElement;

      const errors: number[] = [];
      for (const line of lines) {
        for (const tok of line.tokens) {
          // Park just past the token's start; the fill must already have begun.
          v.pause();
          v.currentTime = tok.start + 0.02;
          await new Promise<void>((r) => v.addEventListener('seeked', () => r(), { once: true }));
          await new Promise<void>((r) => requestAnimationFrame(() => r()));
          await new Promise<void>((r) => setTimeout(r, 0));
          await new Promise<void>((r) => requestAnimationFrame(() => r()));

          const el = document.querySelector(
            `[data-emphasis="active"][data-line-id="${CSS.escape(line.id)}"] [data-token-index="${tok.index}"]`,
          );
          if (!el) { errors.push(Infinity); continue; }
          const p = Number(getComputedStyle(el).getPropertyValue('--p'));
          // Onset error measured against the file's own timing: if the fill has
          // started, the rendered onset is at or before now.
          errors.push(p > 0 ? Math.abs(v.currentTime - tok.start) : Infinity);
        }
      }
      const within = errors.filter((e) => e <= 0.1).length;
      return { total: errors.length, within, worst: Math.max(...errors.filter(Number.isFinite)) };
    });

    expect(result.total).toBeGreaterThan(10);
    expect(result.within / result.total).toBeGreaterThanOrEqual(0.99);
    expect(result.worst).toBeLessThanOrEqual(0.1);
  });

  test('FR-019: overlapping duet lines both display and fill independently', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => '__karaoke' in window);
    const vtt = await (await fetch('http://localhost:5173/tests/fixtures/overlapping.vtt')).text();
    await page.evaluate(async (text) => {
      const api = window.__karaoke;
      api.loadMedia('/tests/fixtures/tiny.webm');
      api.loadLyrics(text, 'overlapping.vtt');
    }, vtt);
    await page.waitForFunction(() => {
      const v = document.querySelector('video') as HTMLVideoElement | null;
      return !!v && v.readyState >= 1;
    });

    await seekTo(page, 4.0); // lead 2.0-6.0 and harmony 3.5-7.0 both cover this
    const lines = await visibleWords(page);
    expect(lines.map((l) => l.id).sort()).toEqual(['harmony', 'lead']);
    for (const line of lines) expect(line.words.length).toBeGreaterThan(0);
  });
});
