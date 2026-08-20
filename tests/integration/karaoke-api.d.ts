import type { MediaState } from '../../src/state/media.svelte.js';
import type { LyricsState } from '../../src/state/lyrics.svelte.js';
import type { PrefsState } from '../../src/state/prefs.svelte.js';
import type { SourcesState } from '../../src/state/sources.svelte.js';

/**
 * The window test seam exposed by App.svelte. Declaring it properly means the
 * integration specs need no `any`, so @typescript-eslint/no-explicit-any stays
 * enabled everywhere instead of being disabled file-wide.
 */
export interface KaraokeTestApi {
  loadFixture(): Promise<void>;
  loadLyrics(text: string, name: string): boolean;
  loadMedia(url: string): void;
  /** Feature 002 — address loading, link restore, and the link itself. */
  loadVideoAddress(url: string): void;
  loadLyricsAddress(url: string): Promise<void>;
  restoreFromLink(fragment: string): Promise<void>;
  shareUrl(): string;
  state: {
    media: MediaState;
    lyrics: LyricsState;
    prefs: PrefsState;
    sources: SourcesState;
  };
}

declare global {
  interface Window {
    __karaoke: KaraokeTestApi;
  }
}
