import { test, expect, type Page } from '@playwright/test';

/** User Story 3 — pause, resume, scrub, rate, and correcting an offset file. */

async function load(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => '__karaoke' in window);
  await page.evaluate(async () => { await window.__karaoke.loadFixture(); });
  await page.waitForFunction(() => {
    const v = document.querySelector('video') as HTMLVideoElement | null;
    return !!v && v.readyState >= 1;
  });
}

async function seekTo(page: Page, t: number) {
  await page.evaluate(async (time) => {
    const v = document.querySelector('video') as HTMLVideoElement;
    v.pause();
    v.currentTime = time;
    await new Promise<void>((r) => v.addEventListener('seeked', () => r(), { once: true }));
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    await new Promise<void>((r) => setTimeout(r, 0));
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
  }, t);
}

const fills = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-emphasis="active"] [data-word]')].map((w) =>
      Number(getComputedStyle(w).getPropertyValue('--p')),
    ),
  );

const activeIds = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-emphasis="active"]')].map((l) => l.getAttribute('data-line-id')),
  );

test.describe('User Story 3 — playback control', () => {
  test('FR-010: pause freezes the highlight exactly in place', async ({ page }) => {
    await load(page);
    await seekTo(page, 3.1);
    const frozen = await fills(page);

    // Hold for well over a frame; nothing may creep while paused.
    await page.waitForTimeout(400);
    expect(await fills(page)).toEqual(frozen);
  });

  test('FR-010: resuming continues without replaying or skipping', async ({ page }) => {
    await load(page);
    await seekTo(page, 3.05);
    const before = await fills(page);

    await page.evaluate(async () => {
      const v = document.querySelector('video') as HTMLVideoElement;
      await v.play();
      await new Promise<void>((r) => setTimeout(r, 200));
      v.pause();
    });
    const after = await fills(page);

    expect(after.length).toBe(before.length);
    // Monotone: every word is at least as filled as it was, none reset.
    for (let i = 0; i < before.length; i++) {
      expect(after[i]!).toBeGreaterThanOrEqual(before[i]!);
    }
  });

  test('SC-004: after a seek the overlay shows the correct line and fill', async ({ page }) => {
    await load(page);
    await seekTo(page, 11.5); // inside cue 3 (10.0 -> 13.0)
    expect(await activeIds(page)).toEqual(['3']);
    const p = await fills(page);
    expect(p[0]).toBe(1);
    expect(p.at(-1)).toBe(0);
  });

  test('FR-009: rate changes still track the audible position', async ({ page }) => {
    await load(page);
    for (const rate of [0.5, 2]) {
      const ok = await page.evaluate(async (r) => {
        const v = document.querySelector('video') as HTMLVideoElement;
        v.pause();
        v.playbackRate = r;
        v.currentTime = 1.0;
        await new Promise<void>((res) => v.addEventListener('seeked', () => res(), { once: true }));
        await v.play();
        await new Promise<void>((res) => setTimeout(res, 300));
        v.pause();
        await new Promise<void>((res) => requestAnimationFrame(() => res()));
        await new Promise<void>((res) => setTimeout(res, 0));
        await new Promise<void>((res) => requestAnimationFrame(() => res()));

        const el = document.querySelector('[data-emphasis="active"] [data-word]');
        const p = el ? Number(getComputedStyle(el).getPropertyValue('--p')) : -1;
        // The overlay must reflect where the media actually is, whatever the rate.
        return { time: v.currentTime, p };
      }, rate);

      expect(ok.p).toBeGreaterThan(0);
      expect(ok.time).toBeGreaterThan(1.0);
    }
  });

  test('rapid scrubbing leaves no stale or duplicated line', async ({ page }) => {
    await load(page);

    // Drag the playhead hard, forwards and backwards, without waiting for frames.
    await page.evaluate(async () => {
      const v = document.querySelector('video') as HTMLVideoElement;
      v.pause();
      const targets = [12, 1.5, 7, 2.2, 11, 0.5, 6, 13.5, 3.3, 10.5, 4.5, 2.0];
      for (const t of targets) {
        v.currentTime = t;
        await new Promise<void>((r) => setTimeout(r, 8));
      }
    });

    // Land somewhere definite and let it settle.
    await seekTo(page, 2.0);

    const ids = await activeIds(page);
    expect(ids).toEqual(['1']);           // exactly one line, the right one
    expect(new Set(ids).size).toBe(ids.length); // no duplicates

    const p = await fills(page);
    expect(p[0]).toBe(1);    // "Hello" 1.0-1.8, sung
    expect(p[2]).toBe(0);    // "my" 2.6-3.0, not yet
  });

  test('FR-013: an offset shifts every word and persists', async ({ page }) => {
    await load(page);
    await seekTo(page, 2.0);
    const before = await fills(page);

    await page.evaluate(() => (window.__karaoke.state.media.offset = 1.0));
    await seekTo(page, 3.0); // same lyric instant, one second later on the media
    expect(await fills(page)).toEqual(before);

    // Persists for the session.
    await seekTo(page, 6.0);
    expect(await page.evaluate(() => window.__karaoke.state.media.offset)).toBe(1.0);
  });

  test('FR-011: controls are present and reachable', async ({ page }) => {
    await load(page);
    for (const id of ['play', 'scrub', 'mute', 'rate', 'fullscreen']) {
      await expect(page.getByTestId(id)).toBeVisible();
    }
  });

  test('the offset control names the direction rather than a bare number', async ({ page }) => {
    await load(page);
    await expect(page.getByTestId('offset-label')).toHaveText('in sync');
    await page.getByRole('button', { name: /0.1 seconds earlier/i }).click();
    await expect(page.getByTestId('offset-label')).toHaveText('lyrics 0.1s early');
  });

  test('Constitution III: the scrubber is throttled, not frame-driven', async ({ page }) => {
    await load(page);
    // Svelte 5 runes are prototype accessors, so Object.keys is empty — probe the
    // values instead. The playhead must not be reachable as state at all; only the
    // throttled scrubber value is.
    const probe = await page.evaluate(async () => {
      // Reading `.position` needs a cast precisely BECAUSE it does not exist on
      // MediaState — the type system already enforces Constitution III at compile
      // time (svelte-check rejects `m.position` outright). This checks the
      // runtime object too, so the guarantee holds even if the type drifts.
      const m = window.__karaoke.state.media as unknown as Record<string, unknown>;
      const v = document.querySelector('video') as HTMLVideoElement;
      v.pause();
      v.currentTime = 7.25;
      await new Promise<void>((r) => v.addEventListener('seeked', () => r(), { once: true }));
      await new Promise<void>((r) => setTimeout(r, 50));
      return {
        hasPosition: 'position' in m,
        scrub: m['scrubPosition'] as number,
        currentTime: v.currentTime,
      };
    });

    expect(probe.hasPosition).toBe(false);
    expect(typeof probe.scrub).toBe('number');
    // The scrubber tracks the media, but via timeupdate — not the frame clock.
    expect(probe.scrub).toBeCloseTo(probe.currentTime, 1);
  });
});
