import type { CueIndex, RenderState, ActiveLine, ResolvePrefs } from './types.js';
import type { LyricLine } from '../vtt/types.js';
import { fillFraction } from './fill.js';

/**
 * Resolves a playback position to what the overlay should draw.
 *
 * CURSOR INDEPENDENCE IS THE CONTRACT: this function must return identical output
 * for the same (lines, position, prefs, offset) regardless of `index.cursor`.
 * The cursor is a performance hint and nothing else. That property is what makes
 * the rapid-scrub edge case a test rather than a debugging session.
 *
 * Phased delivery (contracts/timing-model.md): `active` lands in US1; `preview`
 * and `countdown` are populated by T059 in US4. Until then they are null.
 */

/** Index of the last line whose start <= t, or -1. Pure binary search. */
function lastStartingAtOrBefore(lines: readonly LyricLine[], t: number): number {
  let lo = 0;
  let hi = lines.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid]!.start <= t) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

function activeLineAt(line: LyricLine, t: number): ActiveLine {
  const tokens = line.tokens;
  let activeTokenIndex = -1;
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]!;
    if (t >= tok.start && t < tok.end) {
      activeTokenIndex = i;
      break;
    }
    if (t >= tok.end) activeTokenIndex = i;
  }
  const active = activeTokenIndex >= 0 ? tokens[activeTokenIndex] : undefined;
  return {
    line,
    activeTokenIndex,
    fill: active ? fillFraction(active, t) : 0,
  };
}

export function resolve(
  index: CueIndex | null,
  position: number,
  prefs: ResolvePrefs,
  offset: number,
): RenderState {
  const empty: RenderState = { active: [], preview: null, countdown: null };
  if (!index || index.lines.length === 0) return empty;

  const t = position - offset;
  const lines = index.lines;

  const pivot = lastStartingAtOrBefore(lines, t);

  // Walk left while any earlier line could still be covering t. maxEndPrefix
  // makes the stopping condition exact rather than a heuristic scan depth.
  const active: ActiveLine[] = [];
  for (let i = pivot; i >= 0; i--) {
    if (index.maxEndPrefix[i]! < t) break;
    const line = lines[i]!;
    if (line.start <= t && t < line.end) active.push(activeLineAt(line, t));
  }
  active.reverse();

  index.cursor = pivot < 0 ? 0 : pivot;

  // --- preview + countdown (FR-016, FR-017) ---------------------------------
  // The next line that has not started yet. Binary search already gave us the
  // pivot, so this is a short forward walk, not a scan.
  let next: LyricLine | null = null;
  for (let i = pivot + 1 < 0 ? 0 : pivot + 1; i < lines.length; i++) {
    const cand = lines[i]!;
    if (cand.start > t) { next = cand; break; }
  }

  let preview: LyricLine | null = null;
  let countdown: number | null = null;

  if (next) {
    const until = next.start - t;
    if (until <= prefs.previewWindow) preview = next;
    // Countdown only during a genuine lead-in gap: nothing is being sung right
    // now, and the wait is long enough to be worth counting.
    if (active.length === 0 && until > 0 && until <= prefs.countdownThreshold) {
      countdown = until;
    }
  }

  return { active, preview, countdown };
}
