import { describe, it, expect } from 'vitest';
import { fillFraction } from '../../src/lib/timing/fill.js';
import type { WordToken } from '../../src/lib/vtt/types.js';

const tok = (start: number, end: number): WordToken =>
  ({ text: 'x', start, end, index: 0, derived: false });

describe('contract: monotone fill', () => {
  const t = tok(2, 4);

  it('is exactly 0 at or before start', () => {
    expect(fillFraction(t, 2)).toBe(0);
    expect(fillFraction(t, 1.9)).toBe(0);
    expect(fillFraction(t, -100)).toBe(0);
  });

  it('is exactly 1 at or after end', () => {
    expect(fillFraction(t, 4)).toBe(1);
    expect(fillFraction(t, 4.1)).toBe(1);
    expect(fillFraction(t, 1e9)).toBe(1);
  });

  it('is proportional in between', () => {
    expect(fillFraction(t, 3)).toBeCloseTo(0.5);
    expect(fillFraction(t, 2.5)).toBeCloseTo(0.25);
  });

  it('never decreases as time advances', () => {
    let prev = -1;
    for (let x = 0; x <= 6; x += 0.01) {
      const f = fillFraction(t, x);
      expect(f).toBeGreaterThanOrEqual(prev);
      prev = f;
    }
  });

  it('stays within [0,1] for every input', () => {
    for (let x = -50; x <= 50; x += 0.37) {
      const f = fillFraction(t, x);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(1);
    }
  });
});

describe('degenerate tokens', () => {
  it('reads a zero-length token as complete rather than dividing by zero', () => {
    const z = tok(3, 3);
    expect(fillFraction(z, 2)).toBe(0);
    expect(fillFraction(z, 3)).toBe(1);
    expect(Number.isNaN(fillFraction(z, 3))).toBe(false);
  });

  it('does not produce NaN for an inverted token', () => {
    expect(Number.isNaN(fillFraction(tok(5, 4), 4.5))).toBe(false);
  });
});
