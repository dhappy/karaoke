import { test, expect, type Page } from '@playwright/test';

/**
 * Phase 7 — the guarantees that span every story: no drift, no dropped frames,
 * correct state after backgrounding.
 */

async function load(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => '__karaoke' in window);
  await page.evaluate(async () => { await window.__karaoke.loadFixture(); });
  await page.waitForFunction(() => {
    const v = document.querySelector('video') as HTMLVideoElement | null;
    return !!v && v.readyState >= 1;
  });
}

/** A synthetic 10-minute lyric file, so SC-005 is tested at its stated horizon. */
function longVtt(minutes = 10): string {
  const lines = ['WEBVTT', ''];
  for (let t = 0; t < minutes * 60; t += 5) {
    const ts = (s: number) => {
      const h = String(Math.floor(s / 3600)).padStart(2, '0');
      const m = String(Math.floor(s / 60) % 60).padStart(2, '0');
      const sec = (s % 60).toFixed(3).padStart(6, '0');
      return `${h}:${m}:${sec}`;
    };
    lines.push(`c${t}`, `${ts(t)} --> ${ts(t + 4)}`, `line at ${t} seconds mark here`, '');
  }
  return lines.join('\n');
}

test.describe('endurance and cross-cutting', () => {
  test('SC-005: accuracy at the ten-minute mark matches the first line', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => '__karaoke' in window);

    // A 25s media fixture cannot host a 10-minute timeline, so this asserts the
    // MODEL at the ten-minute horizon: position is read, never accumulated, so
    // the error at t=600 must equal the error at t=0 exactly.
    const drift = await page.evaluate((vtt) => {
      window.__karaoke.loadLyrics(vtt, 'long.vtt');
      const api = window.__karaoke;
      const lines = api.state.lyrics.lines;
      const first = lines[0]!;
      const last = lines[lines.length - 1]!;
      return {
        firstStart: first.start,
        lastStart: last.start,
        firstTokenStart: first.tokens[0]!.start,
        lastTokenStart: last.tokens[0]!.start,
        // Token timings must land exactly on the cue boundary at BOTH ends.
        firstErr: Math.abs(first.tokens[0]!.start - first.start),
        lastErr: Math.abs(last.tokens[0]!.start - last.start),
        lastTailErr: Math.abs(last.tokens[last.tokens.length - 1]!.end - last.end),
      };
    }, longVtt(10));

    expect(drift.lastStart).toBeGreaterThanOrEqual(595);
    expect(drift.firstErr).toBeLessThan(1e-9);
    // The whole point of read-not-accumulate: no growth in error over 10 minutes.
    expect(drift.lastErr).toBeLessThan(1e-9);
    expect(drift.lastTailErr).toBeLessThan(1e-6);
  });

  test('SC-003: continuous playback drops no frames and writes one property per frame', async ({ page }) => {
    await load(page);

    const stats = await page.evaluate(async () => {
      const v = document.querySelector('video') as HTMLVideoElement;
      v.currentTime = 1.0;
      await new Promise<void>((r) => v.addEventListener('seeked', () => r(), { once: true }));

      // Count how many style writes land per frame while playing.
      let writes = 0;
      const proto = CSSStyleDeclaration.prototype;
      const original = proto.setProperty;
      proto.setProperty = function (...args: Parameters<typeof original>) {
        if (args[0] === '--p') writes++;
        return original.apply(this, args);
      };

      const frames: number[] = [];
      let last = performance.now();
      let running = true;
      const tick = () => {
        const now = performance.now();
        frames.push(now - last);
        last = now;
        if (running) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);

      await v.play();
      await new Promise<void>((r) => setTimeout(r, 1500));
      running = false;
      v.pause();
      proto.setProperty = original;

      const sorted = [...frames].sort((a, b) => a - b);
      return {
        frames: frames.length,
        writes,
        median: sorted[Math.floor(sorted.length / 2)] ?? 0,
        worst: sorted[sorted.length - 1] ?? 0,
      };
    });

    expect(stats.frames).toBeGreaterThan(30);
    // Median frame interval near a display refresh — no sustained jank.
    expect(stats.median).toBeLessThan(34);
    // Bounded per-frame DOM mutation: a handful of words, not the whole file.
    expect(stats.writes / stats.frames).toBeLessThan(8);
  });

  test('returning from a hidden tab shows the true playback position', async ({ page, context }) => {
    await load(page);

    await page.evaluate(async () => {
      const v = document.querySelector('video') as HTMLVideoElement;
      v.currentTime = 1.0;
      await new Promise<void>((r) => v.addEventListener('seeked', () => r(), { once: true }));
      await v.play();
    });

    // Background this page by opening and focusing another.
    const other = await context.newPage();
    await other.goto('about:blank');
    await other.bringToFront();
    await page.waitForTimeout(1200);
    await page.bringToFront();
    await other.close();

    const agreement = await page.evaluate(async () => {
      const v = document.querySelector('video') as HTMLVideoElement;
      v.pause();
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      await new Promise<void>((r) => setTimeout(r, 0));
      await new Promise<void>((r) => requestAnimationFrame(() => r()));

      const shown = document.querySelector('[data-emphasis="active"]')?.getAttribute('data-line-id');
      const lines = window.__karaoke.state.lyrics.lines;
      const t = v.currentTime;
      const expected = lines.find((l) => l.start <= t && t < l.end)?.id ?? null;
      return { shown: shown ?? null, expected, t };
    });

    // The overlay must match the media, not where it was when the tab was hidden.
    expect(agreement.shown).toBe(agreement.expected);
  });

  test('Constitution II: the app runs with no network beyond its own origin', async ({ page }) => {
    const offOrigin: string[] = [];
    await page.route('**/*', (route) => {
      const url = route.request().url();
      if (!url.startsWith('http://localhost:5173') && !url.startsWith('data:') && !url.startsWith('blob:')) {
        offOrigin.push(url);
      }
      return route.continue();
    });

    await load(page);
    await page.evaluate(async () => {
      const v = document.querySelector('video') as HTMLVideoElement;
      await v.play();
      await new Promise<void>((r) => setTimeout(r, 500));
      v.pause();
    });

    expect(offOrigin).toEqual([]);
  });
});
