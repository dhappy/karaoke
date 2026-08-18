/**
 * FR-020: tolerate malformed, out-of-order, zero-length, and out-of-range cues by
 * skipping or repairing them while continuing with the rest of the file.
 *
 * Every repair emits a warning naming the source line. None abort the parse.
 * Messages describe the fault class and never echo file content.
 */
import type { Diagnostic, DiagnosticCode } from './types.js';

export interface RawCue {
  readonly id: string;
  start: number;
  end: number;
  readonly payload: string;
  readonly line: number;
}

export interface RepairOutcome {
  readonly kept: RawCue[];
  readonly diagnostics: Diagnostic[];
}

export function warn(code: DiagnosticCode, line: number | null, message: string): Diagnostic {
  return { severity: 'warning', code, line, message };
}

export function fail(code: DiagnosticCode, line: number | null, message: string): Diagnostic {
  return { severity: 'error', code, line, message };
}

/**
 * Applies the repair table. Input order is the file's order; output is sorted by
 * start (ties by end), which CueIndex construction depends on.
 */
export function repairCues(cues: RawCue[], mediaDuration?: number): RepairOutcome {
  const diagnostics: Diagnostic[] = [];
  const kept: RawCue[] = [];
  let previousStart = -Infinity;

  for (const cue of cues) {
    if (cue.end < cue.start) {
      diagnostics.push(
        warn('inverted-cue', cue.line, 'A lyric line ended before it started; its times were swapped.'),
      );
      const s = cue.start;
      cue.start = cue.end;
      cue.end = s;
    }

    if (cue.end === cue.start) {
      diagnostics.push(
        warn('zero-length-cue', cue.line, 'A lyric line had no duration and was skipped; it cannot be highlighted.'),
      );
      continue;
    }

    if (cue.start < previousStart) {
      // Legal for overlaps (FR-019) — diagnosed, never rejected.
      diagnostics.push(
        warn('out-of-order-cue', cue.line, 'A lyric line appeared out of chronological order; it was kept and re-sorted.'),
      );
    }
    previousStart = Math.max(previousStart, cue.start);

    if (mediaDuration !== undefined && cue.start >= mediaDuration) {
      diagnostics.push(
        warn('cue-beyond-media', cue.line, 'A lyric line was timed past the end of the video and was ignored.'),
      );
      continue;
    }

    kept.push(cue);
  }

  kept.sort((a, b) => a.start - b.start || a.end - b.end);
  return { kept, diagnostics };
}
