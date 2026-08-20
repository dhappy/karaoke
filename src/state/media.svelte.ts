import type { Origin, LoadStatus } from './lyrics.svelte.js';
import type { FailureCategory } from '../lib/sources/types.js';

/**
 * Constitution III — the playhead is NOT here, and must never be added.
 *
 * Everything in this class changes at human frequency (a click, a keypress) and
 * is safe to route through runes. The playhead changes at display frequency; it
 * is passed from the clock straight to `resolve()` as an argument and written to
 * the DOM imperatively. See specs/.../data-model.md.
 *
 * The regression to watch for is `position = $state(0)` appearing below. That one
 * line re-diffs the overlay tree sixty times a second and fails SC-003.
 */
export class MediaState {
  status = $state<LoadStatus>('empty');
  origin = $state<Origin | null>(null);
  duration = $state<number | null>(null);
  error = $state<string | null>(null);

  /**
   * Feature 002. Both change at HUMAN frequency — a load starts, a load fails —
   * and are read by chrome components only. Neither may be read on the frame
   * path, which is the same rule the class comment above states for `position`.
   */
  loading = $state(false);
  failure = $state<FailureCategory | null>(null);

  playing = $state(false);
  rate = $state(1);
  seeking = $state(false);
  muted = $state(false);
  volume = $state(1);

  /** Signed seconds. Lyrics are evaluated at `position - offset` (FR-013). */
  offset = $state(0);

  /** Scrubber value only — throttled from `timeupdate`, deliberately not the frame clock. */
  scrubPosition = $state(0);

  get ready(): boolean {
    return this.status === 'ready';
  }

  beginLoad(origin: Origin): void {
    this.status = 'loading';
    this.error = null;
    this.failure = null;
    this.loading = true;
    this.origin = origin;
  }

  succeed(origin: Origin, duration: number): void {
    this.status = 'ready';
    this.origin = origin;
    this.duration = Number.isFinite(duration) ? duration : null;
    this.error = null;
    this.failure = null;
    this.loading = false;
  }

  /** Plain language only — never a raw MediaError code (FR-021). */
  fail(message: string, category: FailureCategory | null = null): void {
    this.status = 'failed';
    this.error = message;
    this.failure = category;
    this.loading = false;
  }

  /**
   * FR-112: a failed load must not destroy working state. When a previous
   * source is reinstated, the slot is READY again — the failure was the new
   * source's, not the surviving one's.
   */
  restored(origin: Origin | null, duration: number | null): void {
    this.status = origin ? 'ready' : 'empty';
    this.origin = origin;
    this.duration = duration;
    this.loading = false;
  }

  clearError(): void {
    this.error = null;
    this.failure = null;
  }
}

export const media = new MediaState();
