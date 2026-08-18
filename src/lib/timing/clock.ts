/**
 * The ONE module inside src/lib/ permitted to touch a live HTMLMediaElement
 * (Constitution I, as scoped by v1.0.1). eslint.config.js exempts this file by
 * name and no other.
 *
 * Research D2 — the loop READS `currentTime` every frame and never accumulates.
 * That is what makes zero drift structural rather than tuned: there is no
 * accumulator to drift. It also means rate changes, tab-backgrounding, and rapid
 * scrubbing need no special-case code, because the next frame reads the truth.
 */

export interface Clock {
  start(): void;
  stop(): void;
  dispose(): void;
}

export interface ClockHost {
  requestAnimationFrame(cb: (t: number) => void): number;
  cancelAnimationFrame(handle: number): void;
  addVisibilityListener(cb: () => void): () => void;
}

/** Default host. Injected so the clock stays testable without a browser. */
function browserHost(): ClockHost {
  return {
    requestAnimationFrame: (cb) => globalThis.requestAnimationFrame(cb),
    cancelAnimationFrame: (h) => globalThis.cancelAnimationFrame(h),
    addVisibilityListener: (cb) => {
      const doc = globalThis.document;
      if (!doc) return () => {};
      const handler = () => {
        if (!doc.hidden) cb();
      };
      doc.addEventListener('visibilitychange', handler);
      return () => doc.removeEventListener('visibilitychange', handler);
    },
  };
}

export function createClock(
  media: HTMLMediaElement,
  onFrame: (position: number) => void,
  host: ClockHost = browserHost(),
): Clock {
  let handle: number | null = null;
  let disposed = false;

  const emit = () => onFrame(media.currentTime);

  const tick = () => {
    if (disposed) return;
    emit();
    handle = host.requestAnimationFrame(tick);
  };

  const start = () => {
    if (disposed || handle !== null) return;
    handle = host.requestAnimationFrame(tick);
  };

  const stop = () => {
    if (handle !== null) {
      host.cancelAnimationFrame(handle);
      handle = null;
    }
    // One FINAL frame so the overlay freezes exactly where it was (FR-010),
    // rather than one frame short of where the person heard the music stop.
    if (!disposed) emit();
  };

  const onPlay = () => start();
  const onPause = () => stop();
  // Seeking must update a PAUSED overlay too (FR-009, SC-004).
  const onSeeked = () => { if (!disposed) emit(); };
  const onLoaded = () => { if (!disposed) emit(); };

  media.addEventListener('play', onPlay);
  media.addEventListener('playing', onPlay);
  media.addEventListener('pause', onPause);
  media.addEventListener('ended', onPause);
  media.addEventListener('seeked', onSeeked);
  media.addEventListener('loadedmetadata', onLoaded);

  // rAF is throttled while hidden, so the first frame back re-reads the true
  // position. No resync logic is needed — this listener just makes it immediate.
  const removeVisibility = host.addVisibilityListener(() => { if (!disposed) emit(); });

  return {
    start,
    stop,
    dispose() {
      disposed = true;
      if (handle !== null) {
        host.cancelAnimationFrame(handle);
        handle = null;
      }
      media.removeEventListener('play', onPlay);
      media.removeEventListener('playing', onPlay);
      media.removeEventListener('pause', onPause);
      media.removeEventListener('ended', onPause);
      media.removeEventListener('seeked', onSeeked);
      media.removeEventListener('loadedmetadata', onLoaded);
      removeVisibility();
    },
  };
}
