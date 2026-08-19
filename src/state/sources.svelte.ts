import { media } from './media.svelte.js';
import { lyrics, type Origin } from './lyrics.svelte.js';
import { normalizeAddress } from '../lib/sources/normalize.js';
import { validateAddress } from '../lib/sources/validate.js';
import { retrieveText } from '../lib/sources/retrieve.js';
import { messageFor } from '../lib/sources/messages.js';
import { classifyMediaError } from '../lib/sources/classify.js';
import {
  decodeLink, encodeLink, linkCompleteness, missingHalf, EMPTY_LINK,
} from '../lib/sources/link.js';
import type {
  FailureCategory, LinkCompleteness, ShareLink, SourceSlot,
} from '../lib/sources/types.js';

/** Conservative historical limit; beyond it, shareability degrades, not playback. */
const MAX_LINK_LENGTH = 2000;

/** Offset changes continuously while dragging; the fragment settles after. */
const OFFSET_SETTLE_MS = 400;

/**
 * Orchestration for the two source slots (feature 002).
 *
 * This is the impure edge for source loading: it may touch `location` and
 * `history`, which src/lib/ may not. The LOGIC it calls — normalize, validate,
 * classify, encode, decode — is all pure and proven in node; what lives here is
 * sequencing, cancellation, and commitment.
 */
export class SourcesState {
  /**
   * The video element's `src`. Owned HERE rather than in App.svelte so that a
   * failed replacement can be undone — see `reinstateVideo`.
   */
  mediaSrc = $state<string | null>(null);

  link = $state<ShareLink>(EMPTY_LINK);
  /** Addresses an incoming link is about to contact, shown before contact (FR-128). */
  announcing = $state<readonly string[]>([]);
  linkTooLong = $state(false);

  /**
   * Monotonic per slot (research D7). Deliberately NOT reactive: these are read
   * inside async continuations and never rendered, and making them reactive
   * would invite a component to depend on load bookkeeping.
   */
  #tokens: Record<SourceSlot, number> = { video: 0, lyrics: 0 };
  #controllers: Record<SourceSlot, AbortController | null> = { video: null, lyrics: null };

  /** Object URL currently backing `mediaSrc`, if the video came from a file. */
  #objectUrl: string | null = null;

  /**
   * The state to restore if a video replacement fails (FR-112).
   *
   * Assigning `<video src>` is DESTRUCTIVE — the previous source is gone the
   * instant the assignment happens, so the lyrics slot's staging trick is not
   * available here. Without this snapshot, replacing a working video with a
   * broken address leaves the person with nothing, which reads as correct in
   * manual testing and fails SC-104.
   */
  #previous: { src: string | null; objectUrl: string | null; origin: Origin | null; duration: number | null } | null = null;

  #offsetTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Survives the reinstated source's own successful load.
   *
   * Reinstating puts the previous video back, and that video then loads
   * normally — which calls `media.succeed()`, which clears `error`. Without
   * this, the explanation for the FAILED replacement would flash and vanish,
   * leaving the person watching their old video reappear with no reason given.
   * The failure belongs to the address they just tried, not to the source that
   * survived it, so it has to outlive the recovery.
   */
  #pendingFailure: { message: string; category: FailureCategory } | null = null;

  get pageProtocol(): string {
    return typeof location === 'undefined' ? 'https:' : location.protocol;
  }

  // ── slot bookkeeping ──────────────────────────────────────────────────────

  /** Claims a slot for a new attempt, abandoning whatever held it. */
  #claim(slot: SourceSlot): number {
    this.#controllers[slot]?.abort();
    this.#controllers[slot] = new AbortController();
    // A deliberate new attempt supersedes the last failure; without this, a
    // held message could resurface on the next successful load.
    if (slot === 'video') this.#pendingFailure = null;
    return ++this.#tokens[slot];
  }

  /** True when the caller still owns the slot and may commit. */
  #owns(slot: SourceSlot, token: number): boolean {
    return this.#tokens[slot] === token;
  }

  #reportFailure(slot: SourceSlot, category: FailureCategory): void {
    const message = messageFor(category, slot);
    if (slot === 'video') {
      media.fail(message, category);
    } else {
      lyrics.loading = false;
      lyrics.failure = category;
      lyrics.diagnostics = [{ severity: 'error', code: 'empty-file', line: null, message }];
    }
  }

  // ── files (unchanged behaviour, routed through the same bookkeeping) ───────

  setVideoFile(file: File): void {
    const token = this.#claim('video');
    this.#snapshotVideo();
    const url = URL.createObjectURL(file);
    if (!this.#owns('video', token)) {
      URL.revokeObjectURL(url);
      return;
    }
    this.#objectUrl = url;
    media.beginLoad({ kind: 'file', name: file.name });
    this.mediaSrc = url;
    this.reflect();
  }

  async setLyricsFile(file: File): Promise<void> {
    const token = this.#claim('lyrics');
    lyrics.loading = true;
    let text: string;
    try {
      text = await file.text();
    } catch {
      if (!this.#owns('lyrics', token)) return;
      lyrics.loading = false;
      lyrics.diagnostics = [{
        severity: 'error', code: 'empty-file', line: null,
        message: 'That file could not be read from disk. Try choosing it again.',
      }];
      return;
    }
    if (!this.#owns('lyrics', token)) return;
    lyrics.loading = false;
    lyrics.load(text, { kind: 'file', name: file.name }, media.duration ?? undefined);
    this.reflect();
  }

  // ── addresses ─────────────────────────────────────────────────────────────

  /**
   * FR-102. Follows the eight-step orchestration in contracts/source-loading.md.
   *
   * The token is re-checked after EVERY await, not only the first: the retrieve
   * resolving and the parse that follows are two separate suspension points, and
   * a slow first address must never overwrite a fast second one (SC-107).
   */
  async loadLyricsFromAddress(raw: string): Promise<void> {
    const normalized = normalizeAddress(raw);
    const validated = validateAddress(normalized, this.pageProtocol);
    if (!validated.ok) {
      // No request made — FR-105.
      this.#reportFailure('lyrics', validated.failure);
      return;
    }

    const token = this.#claim('lyrics');
    const signal = this.#controllers.lyrics!.signal;
    lyrics.loading = true;
    lyrics.failure = null;

    const result = await retrieveText(validated.url, { signal });
    if (!this.#owns('lyrics', token)) return; // abandoned — silently
    lyrics.loading = false;

    if (!result.ok) {
      if ('abandoned' in result) return;
      this.#reportFailure('lyrics', result.failure);
      return;
    }

    // `load` stages and commits only on success, so a parse failure leaves the
    // previous lyrics playing (FR-112).
    const adopted = lyrics.load(
      result.text,
      { kind: 'url', href: validated.url.href },
      media.duration ?? undefined,
    );
    if (!adopted) {
      lyrics.failure = 'unreadable-lyrics';
      lyrics.diagnostics = [{
        severity: 'error', code: 'unparseable-cue-block', line: null,
        message: messageFor('unreadable-lyrics', 'lyrics'),
      }];
      return;
    }
    this.reflect();
  }

  /**
   * Same-origin seam for the dev fixture and the integration tests.
   *
   * Deliberately does NOT go through `validateAddress`: these callers pass a
   * ROOT-RELATIVE path ('/tests/fixtures/tiny.webm'), which `new URL()` rejects
   * and should reject — a person typing an address gives an absolute one, and
   * accepting relative input from the address field would let a typo resolve
   * against our own origin instead of being reported (FR-105).
   *
   * The distinction is real, not a convenience: this is the app loading its own
   * asset, not the person directing the browser somewhere.
   */
  setVideoDirect(href: string): void {
    this.#claim('video');
    this.#snapshotVideo();
    media.beginLoad({ kind: 'url', href });
    this.mediaSrc = href;
  }

  /**
   * FR-101. No `fetch` probe and no `crossorigin` attribute: a media element may
   * load cross-origin without CORS, and opting into it would break videos that
   * work today (research D3).
   */
  loadVideoFromAddress(raw: string): void {
    const normalized = normalizeAddress(raw);
    const validated = validateAddress(normalized, this.pageProtocol);
    if (!validated.ok) {
      this.#reportFailure('video', validated.failure);
      return;
    }

    this.#claim('video');
    this.#snapshotVideo();
    media.beginLoad({ kind: 'url', href: validated.url.href });
    this.mediaSrc = validated.url.href;
  }

  #snapshotVideo(): void {
    this.#previous = {
      src: this.mediaSrc,
      objectUrl: this.#objectUrl,
      origin: media.origin,
      duration: media.duration,
    };
    // NOT revoked here. The old object URL is the only way back if the new
    // source fails, and a revoked blob cannot be reinstated.
    this.#objectUrl = null;
  }

  /** The new video loaded: the old one is finally safe to release. */
  videoSucceeded(): void {
    const stale = this.#previous?.objectUrl;
    if (stale && stale !== this.mediaSrc) URL.revokeObjectURL(stale);
    this.#previous = null;

    // `media.succeed()` has just cleared the error. If this success is the
    // REINSTATED source loading after a failed replacement, put the failure
    // back — it describes the address that failed, not the one now playing.
    if (this.#pendingFailure) {
      media.error = this.#pendingFailure.message;
      media.failure = this.#pendingFailure.category;
      this.#pendingFailure = null;
    }

    this.reflect();
  }

  /**
   * FR-112 / SC-104 — put back what the failed replacement destroyed.
   *
   * Called when the media element reports an error for the source we just
   * assigned. If there was nothing before, there is nothing to restore and the
   * failure simply stands.
   */
  videoFailed(code: number | undefined, hasPlayed: boolean): void {
    const category = classifyMediaError(code, hasPlayed);
    const previous = this.#previous;

    // An interruption mid-playback is not a failed REPLACEMENT: the current
    // source is the one that broke, so there is nothing older to go back to.
    if (hasPlayed || !previous?.src) {
      media.fail(messageFor(category, 'video'), category);
      this.#previous = null;
      return;
    }

    const message = messageFor(category, 'video');

    this.mediaSrc = previous.src;
    this.#objectUrl = previous.objectUrl;
    media.restored(previous.origin, previous.duration);
    media.fail(message, category);
    this.#previous = null;

    // The reinstated source is about to load and clear this. Hand it to
    // `videoSucceeded` so the person keeps the explanation.
    this.#pendingFailure = { message, category };

    this.reflect();
  }

  // ── the share link ────────────────────────────────────────────────────────

  /** A file-backed slot contributes nothing — it would not work for a recipient. */
  #currentLink(): ShareLink {
    const href = (origin: Origin | null): string | null =>
      origin?.kind === 'url' ? origin.href : null;
    return {
      video: href(media.origin),
      lyrics: href(lyrics.origin),
      offset: media.offset,
    };
  }

  /**
   * FR-122 / FR-131 — `replaceState`, never `pushState`.
   *
   * `pushState` would fill the back stack with an entry per source change, so
   * pressing back after loading two sources would step backwards through the
   * session instead of leaving the application. `replaceState` also does not
   * fire `hashchange`, so our own writes cannot re-enter the loader.
   */
  reflect(): void {
    if (typeof location === 'undefined' || typeof history === 'undefined') return;

    const link = this.#currentLink();
    this.link = link;

    const body = encodeLink(link);
    const url = body ? `${location.pathname}${location.search}#${body}` : `${location.pathname}${location.search}`;
    this.linkTooLong = new URL(url, location.origin).href.length > MAX_LINK_LENGTH;

    history.replaceState(null, '', url);
  }

  /** Debounced: dragging an offset slider must not churn the address bar. */
  offsetChanged(value: number): void {
    media.offset = value;
    if (this.#offsetTimer) clearTimeout(this.#offsetTimer);
    this.#offsetTimer = setTimeout(() => {
      this.#offsetTimer = null;
      this.reflect();
    }, OFFSET_SETTLE_MS);
  }

  get completeness(): LinkCompleteness {
    return linkCompleteness(this.link);
  }

  get missing(): 'video' | 'lyrics' | null {
    return missingHalf(this.link);
  }

  /** The absolute link a person copies. Empty when there is nothing to share. */
  get shareUrl(): string {
    if (typeof location === 'undefined') return '';
    const body = encodeLink(this.link);
    return body ? `${location.origin}${location.pathname}#${body}` : '';
  }

  /**
   * FR-123 / FR-128 — restore a pairing from a link.
   *
   * Addresses are ANNOUNCED before they are contacted: they came from the
   * sender, not the recipient, so the person should see where their browser is
   * being pointed rather than learn it from the result.
   */
  async restoreFromLink(fragment: string): Promise<void> {
    const link = decodeLink(fragment, this.pageProtocol);
    if (!link.video && !link.lyrics) {
      this.announcing = [];
      return;
    }

    this.announcing = [link.video, link.lyrics].filter((x): x is string => x !== null);
    // An offset with no sources is held for whatever loads next.
    media.offset = link.offset;

    if (link.video) this.loadVideoFromAddress(link.video);
    if (link.lyrics) await this.loadLyricsFromAddress(link.lyrics);

    this.announcing = [];
  }

  /** Wires boot and back/forward navigation. Our own writes never land here. */
  listen(): () => void {
    if (typeof window === 'undefined') return () => {};
    const onHashChange = () => void this.restoreFromLink(location.hash);
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }
}

export const sources = new SourcesState();
