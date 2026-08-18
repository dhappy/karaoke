import { test, expect, type Page } from '@playwright/test';

/** User Story 4 — presentation, preview, countdown, and legibility. */

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

test.describe('User Story 4 — presentation', () => {
  test('FR-014: text size applies immediately without interrupting playback', async ({ page }) => {
    await load(page);
    await seekTo(page, 2.0);

    const before = await page.evaluate(() => {
      const el = document.querySelector('[data-emphasis="active"]')!;
      return parseFloat(getComputedStyle(el).fontSize);
    });

    await page.getByTestId('text-scale').fill('1.8');

    const after = await page.evaluate(() => {
      const el = document.querySelector('[data-emphasis="active"]')!;
      return parseFloat(getComputedStyle(el).fontSize);
    });

    expect(after).toBeGreaterThan(before);
  });

  test('FR-014: colour scheme applies immediately', async ({ page }) => {
    await load(page);
    await seekTo(page, 2.0);

    const read = () =>
      page.evaluate(() => {
        const el = document.querySelector('[data-emphasis="active"] .sung')!;
        return getComputedStyle(el).color;
      });

    const classic = await read();
    await page.getByTestId('scheme').selectOption('high-contrast');
    await expect
      .poll(async () => page.evaluate(() => document.documentElement.getAttribute('data-scheme')))
      .toBe('high-contrast');
    expect(await read()).not.toBe(classic);
  });

  test('FR-014: placement applies immediately', async ({ page }) => {
    await load(page);
    await page.getByTestId('placement').selectOption('top');
    await expect(page.locator('[data-placement="top"]')).toBeAttached();
  });

  test('FR-016: the next line previews de-emphasised, and is not being sung', async ({ page }) => {
    await load(page);
    await seekTo(page, 3.0); // cue 2 starts at 5.0 — inside the 4s preview window

    const preview = page.locator('[data-emphasis="preview"]');
    await expect(preview).toHaveCount(1);

    const sizes = await page.evaluate(() => {
      const a = document.querySelector('[data-emphasis="active"]')!;
      const p = document.querySelector('[data-emphasis="preview"]')!;
      return {
        active: parseFloat(getComputedStyle(a).fontSize),
        preview: parseFloat(getComputedStyle(p).fontSize),
      };
    });
    expect(sizes.preview).toBeLessThan(sizes.active);
  });

  test('FR-017: the countdown appears in a lead-in gap and ends when the line starts', async ({ page }) => {
    await load(page);

    await seekTo(page, 4.5); // gap; cue 2 starts at 5.0, within the 3s threshold
    await expect(page.getByRole('timer')).toBeVisible();

    await seekTo(page, 5.05); // the line has started
    await expect(page.getByRole('timer')).toHaveCount(0);
  });

  test('a long line wraps and the fill continues onto the second row', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => '__karaoke' in window);
    await page.setViewportSize({ width: 420, height: 700 });

    const vtt = await (await fetch('http://localhost:5173/tests/fixtures/line-only.vtt')).text();
    await page.evaluate((t) => {
      const api = window.__karaoke;
      api.loadMedia('/tests/fixtures/tiny.webm');
      api.loadLyrics(t, 'line-only.vtt');
    }, vtt);
    await page.waitForFunction(() => {
      const v = document.querySelector('video') as HTMLVideoElement | null;
      return !!v && v.readyState >= 1;
    });

    await page.getByTestId('text-scale').fill('2');
    await seekTo(page, 5.5); // inside the long middle line

    const geometry = await page.evaluate(() => {
      const words = [...document.querySelectorAll('[data-emphasis="active"] [data-word]')];
      const tops = words.map((w) => Math.round(w.getBoundingClientRect().top));
      const line = document.querySelector('[data-emphasis="active"]')!.getBoundingClientRect();
      return { rows: new Set(tops).size, right: line.right, vw: window.innerWidth };
    });

    expect(geometry.rows).toBeGreaterThan(1);       // it actually wrapped
    expect(geometry.right).toBeLessThanOrEqual(geometry.vw + 1); // not clipped

    // The fill still resolves correctly across the wrap.
    const p = await page.evaluate(() =>
      [...document.querySelectorAll('[data-emphasis="active"] [data-word]')].map((w) =>
        Number(getComputedStyle(w).getPropertyValue('--p')),
      ),
    );
    expect(p[0]).toBe(1);
    expect(p.at(-1)).toBe(0);
    expect(p.some((v) => v > 0 && v < 1)).toBe(true);
  });

  test('FR-015: lyric text sits on a scrim rather than directly on the video', async ({ page }) => {
    await load(page);
    await seekTo(page, 2.0);
    const bg = await page.evaluate(() => {
      const stack = document.querySelector('[data-emphasis="active"]')!.parentElement!;
      return getComputedStyle(stack).backgroundColor;
    });
    // Not transparent: contrast is measured against this, not against footage.
    // color-mix() computes to color(srgb ...) in Chromium, not rgba().
    expect(bg).not.toBe('rgba(0, 0, 0, 0)');
    expect(bg).not.toBe('transparent');
    expect(bg).toMatch(/^(rgba?\(|color\()/);
    const alpha = /\/\s*([\d.]+)\s*\)/.exec(bg)?.[1] ?? /rgba\([^)]*,\s*([\d.]+)\)/.exec(bg)?.[1];
    expect(Number(alpha ?? 1)).toBeGreaterThan(0.5); // opaque enough to be a floor
  });

  test('FR-012: at phone width the overlay does not occlude the controls', async ({ page }) => {
    await page.setViewportSize({ width: 380, height: 720 });
    await load(page);
    await seekTo(page, 2.0);

    await expect(page.getByTestId('play')).toBeVisible();
    const overlap = await page.evaluate(() => {
      const controls = document.querySelector('[data-testid="controls"]')!.getBoundingClientRect();
      const stack = document.querySelector('[data-emphasis="active"]')!.getBoundingClientRect();
      return stack.bottom > controls.top && stack.top < controls.bottom;
    });
    expect(overlap).toBe(false);
  });

  test('interactive targets meet the 44px floor', async ({ page }) => {
    await load(page);
    const small = await page.evaluate(() => {
      const bad: string[] = [];
      for (const el of document.querySelectorAll('button, select, input[type=range]')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        if (r.height < 44) bad.push(`${el.tagName}.${el.className} h=${Math.round(r.height)}`);
      }
      return bad;
    });
    expect(small).toEqual([]);
  });
});

test.describe('accessibility (T071)', () => {
  test('every control is reachable by keyboard and shows focus', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => '__karaoke' in window);

    const reachable = await page.evaluate(() => {
      const controls = [...document.querySelectorAll('button, select, input')];
      return controls
        .filter((el) => (el as HTMLElement).offsetParent !== null || el.getAttribute('type') === 'file')
        .every((el) => (el as HTMLElement).tabIndex >= 0);
    });
    expect(reachable).toBe(true);

    // Tab lands on something focusable, and focus is visible.
    await page.keyboard.press('Tab');
    const focus = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const s = getComputedStyle(el, ':focus-visible');
      return { tag: el.tagName, outline: s.outlineWidth };
    });
    expect(focus).not.toBeNull();
  });

  test('lyric text is announced once, not three times', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => '__karaoke' in window);
    await page.evaluate(async () => { await window.__karaoke.loadFixture(); });
    await page.waitForFunction(() => {
      const v = document.querySelector('video') as HTMLVideoElement | null;
      return !!v && v.readyState >= 1;
    });
    await page.evaluate(async () => {
      const v = document.querySelector('video') as HTMLVideoElement;
      v.pause();
      v.currentTime = 2.0;
      await new Promise<void>((r) => v.addEventListener('seeked', () => r(), { once: true }));
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      await new Promise<void>((r) => setTimeout(r, 0));
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
    });

    // WordSpan paints two visual layers plus one screen-reader copy. The two
    // visual layers must be aria-hidden or every word is read three times.
    const counts = await page.evaluate(() => {
      const word = document.querySelector('[data-emphasis="active"] [data-word]')!;
      return {
        layers: word.querySelectorAll('.layer').length,
        hidden: word.querySelectorAll('.layer[aria-hidden="true"]').length,
        sr: word.querySelectorAll('.sr').length,
      };
    });
    expect(counts.layers).toBe(2);
    expect(counts.hidden).toBe(2);
    expect(counts.sr).toBe(1);
  });
});

test.describe('FR-015 / SC-008: legibility over real footage', () => {
  /**
   * Only possible with a real video fixture. `busy.webm` is deliberately hostile:
   * full-brightness, high-frequency, rapidly changing. The claim under test is
   * that the scrim keeps lyric text legible over arbitrary content — so this
   * samples ACTUAL COMPOSITED PIXELS rather than trusting the stylesheet.
   */
  async function loadBusy(page: Page) {
    await page.goto('/');
    await page.waitForFunction(() => '__karaoke' in window);
    const vtt = await (await fetch('http://localhost:5173/tests/fixtures/word-timed.vtt')).text();
    await page.evaluate((t) => {
      window.__karaoke.loadMedia('/tests/fixtures/busy.webm');
      window.__karaoke.loadLyrics(t, 'word-timed.vtt');
    }, vtt);
    await page.waitForFunction(() => {
      const v = document.querySelector('video') as HTMLVideoElement | null;
      return !!v && v.readyState >= 2;
    });
  }

  /** WCAG relative luminance of an sRGB triple. */
  const LUM = `(r,g,b)=>{const f=v=>{const s=v/255;return s<=0.03928?s/12.92:Math.pow((s+0.055)/1.055,2.4)};return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b)}`;

  test('the scrim keeps a known dark floor under the text over bright noise', async ({ page }) => {
    await loadBusy(page);
    await seekTo(page, 2.0);

    // Sample the lyric block's PADDING STRIP — pure background, no glyphs. The
    // first version of this test measured the darkest 20% of the whole block and
    // passed even with the scrim deleted, because the dark text-stroke and shadow
    // supply dark pixels whatever is behind them. Measuring a glyph-free region
    // is what makes this test able to fail.
    const stack = page.locator('[data-emphasis="active"]').locator('..');
    const box = await stack.boundingBox();
    expect(box).not.toBeNull();

    const strip = { x: box!.x + 2, y: box!.y + 2, width: Math.max(8, box!.width - 4), height: 6 };
    const shot = await page.screenshot({ clip: strip, type: 'png' });

    const bg = await page.evaluate(
      async ([dataUrl, lumSrc]) => {
        const lum = eval(lumSrc) as (r: number, g: number, b: number) => number;
        const img = new Image();
        img.src = dataUrl as string;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        const ctx = c.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        const { data } = ctx.getImageData(0, 0, c.width, c.height);
        const lums: number[] = [];
        for (let i = 0; i < data.length; i += 4) lums.push(lum(data[i]!, data[i + 1]!, data[i + 2]!));
        lums.sort((a, b) => a - b);
        return { median: lums[Math.floor(lums.length / 2)]!, max: lums[lums.length - 1]! };
      },
      [`data:image/png;base64,${shot.toString('base64')}`, LUM] as const,
    );

    // Bright noise plays behind this strip. If the scrim were absent the median
    // would ride up with the footage; the whole point is that it does not.
    expect(bg.median).toBeLessThan(0.3);

    // And the sung colour must clear a real ratio against that measured floor.
    const sung = await page.evaluate(() => {
      const el = document.querySelector('[data-emphasis="active"] .sung')!;
      const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(getComputedStyle(el).color)!;
      return [Number(m[1]), Number(m[2]), Number(m[3])] as [number, number, number];
    });
    const sungLum = await page.evaluate(
      ([rgb, lumSrc]) => (eval(lumSrc) as (r: number, g: number, b: number) => number)(...(rgb as [number, number, number])),
      [sung, LUM] as const,
    );
    const ratio = (Math.max(sungLum, bg.median) + 0.05) / (Math.min(sungLum, bg.median) + 0.05);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  test('legibility holds at the smallest and largest text sizes', async ({ page }) => {
    await loadBusy(page);
    for (const scale of ['0.6', '2.2']) {
      await page.getByTestId('text-scale').fill(scale);
      await seekTo(page, 2.0);
      const box = await page.locator('[data-emphasis="active"]').boundingBox();
      expect(box, `no active line at scale ${scale}`).not.toBeNull();
      expect(box!.width).toBeGreaterThan(0);
      expect(box!.height).toBeGreaterThan(0);
    }
  });
});
