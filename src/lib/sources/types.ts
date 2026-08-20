/**
 * Source-loading types (feature 002).
 *
 * Pure data. No Svelte, no DOM, no media element, no navigation — this module
 * and its siblings are provable in node, which is what Constitution I asks for.
 */

/** The two independently loadable positions (FR-103). */
export type SourceSlot = 'video' | 'lyrics';

/**
 * Closed set. Adding a member is an interface change, not an implementation
 * detail — the same rule `DiagnosticCode` carries in feature 001.
 *
 * The split between "decidable before a request" and "decidable only from the
 * attempt" is load-bearing: the first three are what let FR-105 report a bad
 * address without contacting anything.
 */
export type FailureCategory =
  // Decidable before any network request (FR-105)
  | 'unusable-address'
  | 'insecure-address'
  | 'streaming-page'
  // Decidable only from the attempt
  | 'refused-or-unreachable'
  | 'not-found'
  | 'forbidden'
  | 'server-error'
  | 'timed-out'
  | 'unreadable-lyrics'
  | 'unplayable-video'
  | 'interrupted';

/** Every member of the union, for exhaustiveness tests. */
export const ALL_FAILURE_CATEGORIES: readonly FailureCategory[] = [
  'unusable-address',
  'insecure-address',
  'streaming-page',
  'refused-or-unreachable',
  'not-found',
  'forbidden',
  'server-error',
  'timed-out',
  'unreadable-lyrics',
  'unplayable-video',
  'interrupted',
] as const;

/** Failures `validateAddress` can reach without touching the network. */
export type PreNetworkFailure = 'unusable-address' | 'insecure-address' | 'streaming-page';

export type ValidateResult =
  | { readonly ok: true; readonly url: URL }
  | { readonly ok: false; readonly failure: PreNetworkFailure };

export type RetrieveResult =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly failure: FailureCategory }
  | { readonly ok: false; readonly abandoned: true };

/**
 * The decoded contents of the application's own fragment.
 *
 * Carries the offset because a timing correction describes how a lyric file sits
 * against a recording — a property of the PAIRING. Carries no display
 * preferences, which belong to whoever is reading the screen (FR-125).
 */
export interface ShareLink {
  readonly video: string | null;
  readonly lyrics: string | null;
  /** Signed seconds. */
  readonly offset: number;
}

export type LinkCompleteness = 'complete' | 'partial' | 'empty';

/** One attempt to fill one slot from one address. Mutable and short-lived. */
export interface AddressLoadAttempt {
  readonly slot: SourceSlot;
  /** Monotonic per slot. Guards late commits — see research D7. */
  readonly token: number;
  /** Normalized and validated. Never the raw input. */
  readonly href: string;
  state: 'validating' | 'loading' | 'succeeded' | 'failed' | 'abandoned';
  /** Null for the video slot, which has no fetch to abort. */
  controller: AbortController | null;
  failure: FailureCategory | null;
}
