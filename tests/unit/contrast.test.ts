import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * SC-008 / research D9 — contrast is measured against the composited SCRIM, not
 * against video.
 *
 * That is the whole point of the scrim decision: contrast against arbitrary
 * footage is not a property that can be verified, because the footage is
 * unbounded and any check is a sample. Interposing a known surface turns the
 * claim into a computable ratio that a unit test can assert. This file is the
 * cash value of that design decision.
 */

const css = readFileSync(new URL('../../src/styles/tokens.css', import.meta.url), 'utf8');

type RGB = [number, number, number];

function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '').trim();
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/** WCAG relative luminance. */
function luminance([r, g, b]: RGB): number {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrastRatio(a: RGB, b: RGB): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Extracts the token values for one scheme block from tokens.css. */
function scheme(selector: string): Record<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const block = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  if (!block) throw new Error(`scheme block not found: ${selector}`);
  const out: Record<string, string> = {};
  for (const m of block[1]!.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    out[m[1]!] = m[2]!.trim();
  }
  return out;
}

const base = scheme(':root');
const SCHEMES: Record<string, Record<string, string>> = {
  classic: base,
  'high-contrast': { ...base, ...scheme(":root[data-scheme='high-contrast']") },
  warm: { ...base, ...scheme(":root[data-scheme='warm']") },
  cool: { ...base, ...scheme(":root[data-scheme='cool']") },
};

/**
 * The floor. Lyric text is large and bold in every scheme, so WCAG large-text
 * (3:1) is the applicable threshold; 4.5:1 is asserted anyway because lyrics are
 * read at a glance while doing something else.
 */
const FLOOR = 4.5;

describe('SC-008: every scheme clears the contrast floor against the scrim', () => {
  for (const [name, tokens] of Object.entries(SCHEMES)) {
    describe(name, () => {
      const scrim = hexToRgb(tokens['--scrim-solid']!);

      it.each(['--sung', '--unsung', '--preview'])('%s is legible on the scrim', (token) => {
        const ratio = contrastRatio(hexToRgb(tokens[token]!), scrim);
        expect(ratio).toBeGreaterThanOrEqual(FLOOR);
      });

      it('distinguishes sung from unsung by more than colour name alone', () => {
        // The two states must be separable, but the fill BOUNDARY is the second
        // channel (Constitution, Quality Standards) — so this is a sanity check
        // that they are not literally the same colour, not a contrast floor.
        expect(tokens['--sung']).not.toBe(tokens['--unsung']);
      });

      it('keeps the preview de-emphasised relative to the active text', () => {
        const active = contrastRatio(hexToRgb(tokens['--unsung']!), scrim);
        const preview = contrastRatio(hexToRgb(tokens['--preview']!), scrim);
        expect(preview).toBeLessThan(active);
      });
    });
  }
});

describe('the scrim itself', () => {
  it('is defined for every scheme, so contrast never depends on the video', () => {
    for (const tokens of Object.values(SCHEMES)) {
      expect(tokens['--scrim-solid']).toMatch(/^#[0-9a-f]{3,6}$/i);
    }
  });

  it('is dark enough that light text sits on a known floor', () => {
    for (const tokens of Object.values(SCHEMES)) {
      expect(luminance(hexToRgb(tokens['--scrim-solid']!))).toBeLessThan(0.1);
    }
  });
});

describe('contrast survives every text size', () => {
  it('is size-independent by construction', () => {
    // Colour tokens do not vary with --text-scale; the scale only multiplies
    // font-size. Asserting the absence of a size-conditional colour override is
    // what keeps that true as the stylesheet grows.
    expect(css).not.toMatch(/--text-scale[^;]*\)\s*\{[^}]*--(sung|unsung|preview)\s*:/);
  });
});
