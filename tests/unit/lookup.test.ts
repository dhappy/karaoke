import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseWebVTT } from '../../src/lib/vtt/parse.js';
import { buildIndex } from '../../src/lib/timing/index.js';
import { resolve } from '../../src/lib/timing/lookup.js';
import type { CueIndex, RenderState } from '../../src/lib/timing/types.js';

const fixture = (n: string) => readFileSync(new URL(`../fixtures/${n}`, import.meta.url), 'utf8');
const PREFS = { previewWindow: 4, countdownThreshold: 3 };

function indexOf(name: string): CueIndex {
  const r = parseWebVTT(fixture(name));
  return buildIndex(r.lines);
}

/** Comparable snapshot of a RenderState — identity of lines plus fill position. */
function snapshot(s: RenderState): string {
  return JSON.stringify({
    active: s.active.map((a) => ({
      id: a.line.id,
      tok: a.activeTokenIndex,
      fill: Number(a.fill.toFixed(9)),
    })),
    preview: s.preview?.id ?? null,
    countdown: s.countdown === null ? null : Number(s.countdown.toFixed(9)),
  });
}

const CORPUS = ['word-timed.vtt', 'line-only.vtt', 'overlapping.vtt', 'malformed.vtt'];

describe('contract: cursor independence', () => {
  // The property that catches every scrub bug. If resolve ever consults the
  // cursor for CORRECTNESS rather than speed, one of these orders diverges.
  it.each(CORPUS)('same output forwards, backwards, and shuffled for %s', (name) => {
    const times: number[] = [];
    for (let t = 0; t <= 25; t += 0.05) times.push(Number(t.toFixed(2)));

    const forward = new Map<number, string>();
    {
      const idx = indexOf(name);
      for (const t of times) forward.set(t, snapshot(resolve(idx, t, PREFS, 0)));
    }

    // Backwards: cursor is always ahead of the query.
    {
      const idx = indexOf(name);
      for (const t of [...times].reverse()) {
        expect(snapshot(resolve(idx, t, PREFS, 0))).toBe(forward.get(t));
      }
    }

    // Shuffled: deterministic LCG so a failure is reproducible.
    {
      const idx = indexOf(name);
      const shuffled = [...times];
      let seed = 12345;
      for (let i = shuffled.length - 1; i > 0; i--) {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        const j = seed % (i + 1);
        [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
      }
      for (const t of shuffled) {
        expect(snapshot(resolve(idx, t, PREFS, 0))).toBe(forward.get(t));
      }
    }

    // A freshly built index (cursor 0) must agree with a well-advanced one.
    {
      const fresh = indexOf(name);
      const advanced = indexOf(name);
      resolve(advanced, 24, PREFS, 0);
      for (const t of times) {
        expect(snapshot(resolve(advanced, t, PREFS, 0))).toBe(snapshot(resolve(fresh, t, PREFS, 0)));
      }
    }
  });

  it('never lets a hand-corrupted cursor change the answer', () => {
    const idx = indexOf('overlapping.vtt');
    const truth = snapshot(resolve(idx, 4.0, PREFS, 0));
    for (const bogus of [-5, 0, 1, 2, 99, 1e6]) {
      idx.cursor = bogus;
      expect(snapshot(resolve(idx, 4.0, PREFS, 0))).toBe(truth);
    }
  });
});

describe('FR-019: overlap completeness', () => {
  const idx = indexOf('overlapping.vtt');

  it('returns EVERY covering line, not the first', () => {
    // lead 2.0-6.0, harmony 3.5-7.0 — both cover 4.0
    const s = resolve(idx, 4.0, PREFS, 0);
    expect(s.active.map((a) => a.line.id).sort()).toEqual(['harmony', 'lead']);
  });

  it('highlights each overlapping line independently', () => {
    const s = resolve(idx, 5.2, PREFS, 0);
    expect(s.active.length).toBe(2);
    const fills = s.active.map((a) => a.fill);
    expect(new Set(fills).size).toBeGreaterThanOrEqual(1);
    for (const a of s.active) {
      expect(a.activeTokenIndex).toBeGreaterThanOrEqual(0);
    }
  });

  it('drops back to one line when the overlap ends', () => {
    expect(resolve(idx, 6.5, PREFS, 0).active.map((a) => a.line.id)).toEqual(['harmony']);
    expect(resolve(idx, 9.5, PREFS, 0).active.map((a) => a.line.id)).toEqual(['solo']);
  });
});

describe('FR-005: empty is a valid answer', () => {
  const idx = indexOf('word-timed.vtt');

  it('clears the overlay in a gap between lines', () => {
    expect(resolve(idx, 4.5, PREFS, 0).active).toEqual([]);
  });

  it('clears before the first line and after the last', () => {
    expect(resolve(idx, 0, PREFS, 0).active).toEqual([]);
    expect(resolve(idx, 99, PREFS, 0).active).toEqual([]);
  });

  it('returns empty for a null index', () => {
    expect(resolve(null, 5, PREFS, 0).active).toEqual([]);
  });
});

describe('FR-013 / D7: offset', () => {
  const idx = indexOf('word-timed.vtt');

  it('shifts evaluation by exactly the offset', () => {
    const base = snapshot(resolve(idx, 2.0, PREFS, 0));
    expect(snapshot(resolve(idx, 2.5, PREFS, 0.5))).toBe(base);
    expect(snapshot(resolve(idx, 1.5, PREFS, -0.5))).toBe(base);
  });

  it('is reversible: evaluating at t+x with offset x equals evaluating at t', () => {
    // Every boundary in the index. Float arithmetic makes (t + x) - x differ from
    // t by an ULP, which flips the answer exactly AT a boundary -- so the property
    // is asserted away from boundaries. See contract guarantee 7.
    const bounds: number[] = [];
    for (const line of idx.lines) {
      bounds.push(line.start, line.end);
      for (const tk of line.tokens) bounds.push(tk.start, tk.end);
    }
    const nearBoundary = (t: number) => bounds.some((b) => Math.abs(b - t) < 1e-6);

    let checked = 0;
    for (const x of [0.001, 0.25, 1, 3.75, -2.5]) {
      for (let t = 0; t <= 14; t += 0.25) {
        if (nearBoundary(t) || nearBoundary(t + x)) continue;
        expect(snapshot(resolve(idx, t + x, PREFS, x))).toBe(snapshot(resolve(idx, t, PREFS, 0)));
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(200); // the filter must not empty the test
  });

  it('restores original behaviour when the offset returns to zero', () => {
    const before = snapshot(resolve(idx, 2.0, PREFS, 0));
    resolve(idx, 2.0, PREFS, 3.5);
    resolve(idx, 2.0, PREFS, -1.25);
    expect(snapshot(resolve(idx, 2.0, PREFS, 0))).toBe(before);
  });

  it('does not mutate the parsed cue times', () => {
    const before = JSON.stringify(idx.lines);
    resolve(idx, 5, PREFS, 2.5);
    expect(JSON.stringify(idx.lines)).toBe(before);
  });
});

describe('FR-016: preview line', () => {
  const idx = indexOf('word-timed.vtt'); // cues at 1-4, 5-8.5, 10-13

  it('shows the next line once it is inside the preview window', () => {
    // At 3.0, cue 2 starts in 2.0s — inside the 4s window.
    expect(resolve(idx, 3.0, PREFS, 0).preview?.id).toBe('2');
  });

  it('shows no preview when the next line is still far away', () => {
    // At 1.0, cue 2 starts in 4.0s; with a 2s window that is out of range.
    expect(resolve(idx, 1.0, { previewWindow: 2, countdownThreshold: 3 }, 0).preview).toBeNull();
  });

  it('never previews a line that is already active', () => {
    const s = resolve(idx, 5.5, PREFS, 0);
    const activeIds = s.active.map((a) => a.line.id);
    expect(activeIds).toContain('2');
    expect(s.preview?.id).not.toBe('2');
  });

  it('has no preview after the final line', () => {
    expect(resolve(idx, 14, PREFS, 0).preview).toBeNull();
  });
});

describe('FR-017: countdown', () => {
  const idx = indexOf('word-timed.vtt');

  it('counts down during a lead-in gap', () => {
    // 4.5 is in the gap; cue 2 starts at 5.0, so 0.5s remain.
    const s = resolve(idx, 4.5, PREFS, 0);
    expect(s.active).toEqual([]);
    expect(s.countdown).toBeCloseTo(0.5, 6);
  });

  it('stays silent while a line is being sung', () => {
    expect(resolve(idx, 2.0, PREFS, 0).countdown).toBeNull();
  });

  it('stays silent when the gap is longer than the threshold', () => {
    // At 8.6 the next line starts at 10.0 — 1.4s away, inside a 3s threshold.
    expect(resolve(idx, 8.6, PREFS, 0).countdown).toBeCloseTo(1.4, 6);
    // With a 1s threshold that same gap is too long to count.
    expect(resolve(idx, 8.6, { previewWindow: 4, countdownThreshold: 1 }, 0).countdown).toBeNull();
  });

  it('ends exactly when the line starts', () => {
    expect(resolve(idx, 5.0, PREFS, 0).countdown).toBeNull();
    expect(resolve(idx, 4.999, PREFS, 0).countdown).toBeGreaterThan(0);
  });
});
