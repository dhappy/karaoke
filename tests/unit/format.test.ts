import { describe, it, expect } from 'vitest';
import { formatTime, formatOffset } from '../../src/lib/format.js';

describe('formatTime', () => {
  it.each([
    [0, '0:00'], [5, '0:05'], [65, '1:05'], [599, '9:59'],
    [600, '10:00'], [3599, '59:59'], [3600, '1:00:00'], [3725, '1:02:05'],
  ])('formats %ss as %s', (input, expected) => {
    expect(formatTime(input)).toBe(expected);
  });

  it('never produces NaN or a negative clock', () => {
    for (const bad of [NaN, Infinity, -Infinity, -5]) {
      expect(formatTime(bad)).toBe('0:00');
    }
  });
});

describe('formatOffset', () => {
  it('names the direction rather than showing a bare number', () => {
    expect(formatOffset(0)).toBe('in sync');
    expect(formatOffset(0.4)).toBe('lyrics 0.4s late');
    expect(formatOffset(-0.4)).toBe('lyrics 0.4s early');
    expect(formatOffset(-1.25)).toBe('lyrics 1.25s early');
  });

  it('treats a rounding-zero offset as in sync', () => {
    expect(formatOffset(0.001)).toBe('in sync');
  });
});
