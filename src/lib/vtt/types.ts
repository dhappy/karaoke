/**
 * Parse-output types. Immutable after parse: the timing offset is applied at
 * lookup (research D7), so cue times stay a faithful record of the file.
 *
 * All times are SECONDS, matching HTMLMediaElement.currentTime. Never
 * milliseconds — a mixed-unit codebase is where sync bugs live.
 */

/** The smallest highlighted unit. */
export interface WordToken {
  readonly text: string;
  readonly start: number;
  readonly end: number;
  /** 0-based position within the line. */
  readonly index: number;
  /** True when timing was derived by distribution rather than read from the file. */
  readonly derived: boolean;
}

/** One timed unit of lyrics. May overlap other lines in time (FR-019). */
export interface LyricLine {
  readonly id: string;
  readonly start: number;
  readonly end: number;
  /** Display text, markup already stripped (FR-018). */
  readonly text: string;
  readonly tokens: readonly WordToken[];
  /** Speaker from a <v Name> annotation. Metadata only — never rendered. */
  readonly voice: string | null;
}

/** Closed set. Adding a member is an interface change, not an implementation detail. */
export type DiagnosticCode =
  | 'missing-webvtt-header'
  | 'malformed-timestamp'
  | 'zero-length-cue'
  | 'inverted-cue'
  | 'out-of-order-cue'
  | 'cue-beyond-media'
  | 'unparseable-cue-block'
  | 'empty-file'
  | 'no-cues';

/**
 * The parser's error channel — the reason the parser is hand-written rather than
 * delegated to the platform TextTrack API (research D1).
 *
 * `message` never echoes file content. Messages describe the fault class and the
 * fix; untrusted input does not travel into the UI through this type.
 */
export interface Diagnostic {
  readonly severity: 'error' | 'warning';
  readonly code: DiagnosticCode;
  /** 1-based line number in the source file, or null when not attributable. */
  readonly line: number | null;
  readonly message: string;
}

export type ParseResult =
  | { readonly ok: true; readonly lines: LyricLine[]; readonly diagnostics: Diagnostic[] }
  | { readonly ok: false; readonly lines: []; readonly diagnostics: Diagnostic[] };

export interface ParseOptions {
  /** Enables cue-beyond-media diagnostics when the media duration is known. */
  readonly mediaDuration?: number;
  /** Locale for Intl.Segmenter word breaking. */
  readonly locale?: string;
}
