import type { WordToken } from '../vtt/types.js';

/**
 * FR-007: how far the highlight has filled across a token, in proportion to how
 * far playback has advanced through its time range.
 *
 * Monotone non-decreasing in `at`; exactly 0 at or before start; exactly 1 at or
 * after end. A zero-length token reads as complete rather than dividing by zero.
 */
export function fillFraction(token: WordToken, at: number): number {
  const span = token.end - token.start;
  if (!(span > 0)) return at >= token.end ? 1 : 0;
  if (at <= token.start) return 0;
  if (at >= token.end) return 1;
  return (at - token.start) / span;
}
