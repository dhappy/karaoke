import type { LyricLine } from '../vtt/types.js';

/**
 * Built once per lyric load. The timing offset does NOT invalidate it — offset is
 * applied at lookup (research D7).
 */
export interface CueIndex {
  /** Sorted by start, ties broken by end. */
  readonly lines: readonly LyricLine[];
  /** maxEndPrefix[i] = max(lines[0..i].end). Makes all-covering-interval lookup logarithmic. */
  readonly maxEndPrefix: readonly number[];
  /**
   * Last resolved index. ADVISORY ONLY — correctness never depends on it.
   * `resolve` must return identical output for the same inputs regardless of
   * cursor state; that property is what catches every scrub bug.
   */
  cursor: number;
}

export interface ActiveLine {
  readonly line: LyricLine;
  /** Index into line.tokens of the token currently being sung, or -1 if none. */
  readonly activeTokenIndex: number;
  /** Fraction [0,1] of the active token completed. */
  readonly fill: number;
}

/** What the overlay draws for one frame. Pure function of position and index. */
export interface RenderState {
  /** Zero, one, or many (FR-019). Empty means clear the overlay (FR-005). */
  readonly active: readonly ActiveLine[];
  /** Next line if within previewWindow (FR-016). Null until T059 completes it. */
  readonly preview: LyricLine | null;
  /** Seconds until the next line when the gap exceeds the threshold (FR-017). */
  readonly countdown: number | null;
}

export interface ResolvePrefs {
  readonly previewWindow: number;
  readonly countdownThreshold: number;
}
