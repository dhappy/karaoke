import type { LyricLine } from '../vtt/types.js';
import type { CueIndex } from './types.js';

/**
 * Builds the interval index (research D5).
 *
 * `maxEndPrefix[i]` is the running maximum of end times. It is what makes finding
 * ALL lines covering an instant logarithmic rather than linear — necessary
 * because duets mean "the one cue containing t" is the wrong question (FR-019).
 *
 * Not invalidated by the timing offset: offset is applied at lookup (D7).
 */
export function buildIndex(lines: readonly LyricLine[]): CueIndex {
  const sorted = [...lines].sort((a, b) => a.start - b.start || a.end - b.end);
  const maxEndPrefix = new Array<number>(sorted.length);
  let running = -Infinity;
  for (let i = 0; i < sorted.length; i++) {
    running = Math.max(running, sorted[i]!.end);
    maxEndPrefix[i] = running;
  }
  return { lines: sorted, maxEndPrefix, cursor: 0 };
}
