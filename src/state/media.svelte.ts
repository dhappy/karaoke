import type { Origin, LoadStatus } from './lyrics.svelte.js';

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
    this.origin = origin;
  }

  succeed(origin: Origin, duration: number): void {
    this.status = 'ready';
    this.origin = origin;
    this.duration = Number.isFinite(duration) ? duration : null;
    this.error = null;
  }

  /** Plain language only — never a raw MediaError code (FR-021). */
  fail(message: string): void {
    this.status = 'failed';
    this.error = message;
  }

  clearError(): void {
    this.error = null;
  }
}

export const media = new MediaState();
