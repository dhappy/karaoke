import { parseWebVTT } from '../lib/vtt/parse.js';
import { buildIndex } from '../lib/timing/index.js';
import type { Diagnostic, LyricLine } from '../lib/vtt/types.js';
import type { CueIndex } from '../lib/timing/types.js';
import type { FailureCategory } from '../lib/sources/types.js';

export type LoadStatus = 'empty' | 'loading' | 'ready' | 'failed';
export type Origin = { kind: 'file'; name: string } | { kind: 'url'; href: string };

/**
 * Constitution IV — a failed load MUST NOT destroy working state.
 *
 * Parse results are staged and swapped in only on success. `lines`, `index`, and
 * the previous origin survive a failed load untouched, so the person keeps
 * playing what they already had (FR-021).
 */
export class LyricsState {
  status = $state<LoadStatus>('empty');
  origin = $state<Origin | null>(null);
  lines = $state<readonly LyricLine[]>([]);
  diagnostics = $state<readonly Diagnostic[]>([]);
  index = $state<CueIndex | null>(null);

  /**
   * Feature 002. `load()` below is deliberately UNCHANGED: its staging already
   * satisfies FR-112 for this slot, because a failed parse commits diagnostics
   * and nothing else. The video slot has no such luxury — see
   * SourcesState.reinstateVideo.
   */
  loading = $state(false);
  failure = $state<FailureCategory | null>(null);

  get warnings(): readonly Diagnostic[] {
    return this.diagnostics.filter((d) => d.severity === 'warning');
  }

  get errors(): readonly Diagnostic[] {
    return this.diagnostics.filter((d) => d.severity === 'error');
  }

  get hasLyrics(): boolean {
    return this.lines.length > 0;
  }

  /**
   * Parses into a staging slot and commits only on success.
   * Returns true when the new source was adopted.
   */
  load(source: string, origin: Origin, mediaDuration?: number): boolean {
    this.status = 'loading';
    const result = parseWebVTT(source, mediaDuration === undefined ? {} : { mediaDuration });

    if (!result.ok) {
      // Commit the diagnostics so the person is told what happened — but leave
      // lines/index/origin alone. This is the FR-021 clause most likely to regress.
      this.diagnostics = result.diagnostics;
      this.status = this.hasLyrics ? 'ready' : 'failed';
      return false;
    }

    this.lines = result.lines;
    this.diagnostics = result.diagnostics;
    this.index = buildIndex(result.lines);
    this.origin = origin;
    this.status = 'ready';
    return true;
  }

  clear(): void {
    this.status = 'empty';
    this.origin = null;
    this.lines = [];
    this.diagnostics = [];
    this.index = null;
  }

  dismissDiagnostics(): void {
    this.diagnostics = [];
  }
}

export const lyrics = new LyricsState();
