/**
 * The feature's trust boundary: turns an arbitrary user-supplied file into the
 * validated data model. Pure — no DOM, no media element, no I/O, no async.
 *
 * TOTALITY IS A CONTRACT GUARANTEE: this function never throws, for any string
 * input including binary garbage. Callers need no try/catch.
 */
import type { Diagnostic, LyricLine, ParseOptions, ParseResult, WordToken } from './types.js';
import { sanitize, sanitizeToDisplayText } from './sanitize.js';
import { repairCues, fail, warn, type RawCue } from './repair.js';
import { segmentWords, graphemeCount } from './tokenize.js';

const TIMING_LINE = /-->/;
const TIMESTAMP = /(\d{1,3}):(\d{2})(?::(\d{2}))?\.(\d{1,3})/;
const INLINE_TS = /<(\d{1,3}):(\d{2})(?::(\d{2}))?\.(\d{1,3})>/g;

/** `hh:mm:ss.mmm` or `mm:ss.mmm`. Returns null rather than throwing. */
export function parseTimestamp(raw: string): number | null {
  const m = TIMESTAMP.exec(raw.trim());
  if (!m || m.index !== 0) return null;
  const a = Number(m[1]), b = Number(m[2]), c = m[3] === undefined ? null : Number(m[3]);
  const ms = Number(m[4]!.padEnd(3, '0'));
  if ([a, b, ms].some((n) => !Number.isFinite(n))) return null;
  // Three groups => h:m:s; two => m:s.
  const seconds = c === null ? a * 60 + b : a * 3600 + b * 60 + c;
  return seconds + ms / 1000;
}

/**
 * Distributes a line's duration across its words in proportion to grapheme count
 * (FR-004, research D8). Weights sum to exactly the line duration by
 * construction, which is what makes SC-009's gapless coverage structural.
 */
function deriveTokens(text: string, start: number, end: number, locale: string): WordToken[] {
  const segs = segmentWords(text, locale);
  if (segs.length === 0) return [];
  const total = segs.reduce((n, s) => n + s.weight, 0) || segs.length;
  const span = end - start;

  const tokens: WordToken[] = [];
  let acc = 0;
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i]!;
    const w = total === 0 ? 1 / segs.length : seg.weight / total;
    const tStart = start + span * acc;
    acc += w;
    // Last token pinned to `end` so float drift can never leave a tail gap.
    const tEnd = i === segs.length - 1 ? end : start + span * acc;
    tokens.push({ text: seg.text, start: tStart, end: tEnd, index: i, derived: true });
  }
  return tokens;
}

/**
 * Reads word timings from inline <timestamp> tags (FR-003). Text before the first
 * timestamp belongs to the cue start; each timestamp opens the run that follows it.
 */
function tokensFromInline(payload: string, start: number, end: number, locale: string): WordToken[] | null {
  INLINE_TS.lastIndex = 0;
  const marks: { at: number; index: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = INLINE_TS.exec(payload)) !== null) {
    const t = parseTimestamp(m[0].slice(1, -1));
    if (t !== null) marks.push({ at: t, index: m.index });
  }
  if (marks.length === 0) return null;

  // Split the payload into runs: [runStart, runEnd) with the time that opens it.
  const runs: { text: string; from: number; to: number }[] = [];
  const head = payload.slice(0, marks[0]!.index);
  if (head.trim() !== '') runs.push({ text: head, from: start, to: marks[0]!.at });

  for (let i = 0; i < marks.length; i++) {
    const mark = marks[i]!;
    const tagEnd = payload.indexOf('>', mark.index) + 1;
    const nextIndex = i + 1 < marks.length ? marks[i + 1]!.index : payload.length;
    const text = payload.slice(tagEnd, nextIndex);
    const to = i + 1 < marks.length ? marks[i + 1]!.at : end;
    if (text.trim() !== '') runs.push({ text, from: mark.at, to });
  }

  const tokens: WordToken[] = [];
  for (const run of runs) {
    const clean = sanitize(run.text).text.replace(/<[^>]*>/g, '');
    const segs = segmentWords(clean, locale);
    if (segs.length === 0) continue;
    // A run may hold several words; subdivide it by grapheme weight so the fill
    // still advances continuously inside the run.
    const total = segs.reduce((n, s) => n + s.weight, 0) || segs.length;
    const span = Math.max(0, run.to - run.from);
    let acc = 0;
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i]!;
      const w = total === 0 ? 1 / segs.length : seg.weight / total;
      const tStart = run.from + span * acc;
      acc += w;
      const tEnd = i === segs.length - 1 ? run.to : run.from + span * acc;
      tokens.push({ text: seg.text, start: tStart, end: tEnd, index: tokens.length, derived: false });
    }
  }
  return tokens.length > 0 ? tokens : null;
}

function normalise(source: string): string {
  return source.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

export function parseWebVTT(source: string, opts: ParseOptions = {}): ParseResult {
  const locale = opts.locale ?? 'en';
  const diagnostics: Diagnostic[] = [];

  let text: string;
  try {
    text = normalise(typeof source === 'string' ? source : String(source));
  } catch {
    return { ok: false, lines: [], diagnostics: [fail('empty-file', null, 'The lyric file could not be read as text.')] };
  }

  if (text.trim() === '') {
    return { ok: false, lines: [], diagnostics: [fail('empty-file', null, 'The lyric file is empty. Choose a file containing lyrics.')] };
  }

  const all = text.split('\n');
  const first = (all[0] ?? '').trim();
  if (!/^WEBVTT(\s|$)/.test(first)) {
    return {
      ok: false,
      lines: [],
      diagnostics: [fail('missing-webvtt-header', 1, 'This file does not start with the WEBVTT header, so it is not a WebVTT lyric file. Choose a .vtt file.')],
    };
  }

  // --- block scan -------------------------------------------------------
  const raw: RawCue[] = [];
  let i = 1;
  let ordinal = 0;

  while (i < all.length) {
    while (i < all.length && (all[i] ?? '').trim() === '') i++;
    if (i >= all.length) break;

    const blockStart = i;
    const block: string[] = [];
    while (i < all.length && (all[i] ?? '').trim() !== '') {
      block.push(all[i] ?? '');
      i++;
    }

    const head = (block[0] ?? '').trim();
    if (/^(NOTE|STYLE|REGION)(\s|$)/.test(head)) continue;

    const timingIdx = block.findIndex((l) => TIMING_LINE.test(l));
    if (timingIdx === -1) {
      diagnostics.push(warn('unparseable-cue-block', blockStart + 1, 'A block in the file was not a lyric line and was skipped.'));
      continue;
    }

    const id = timingIdx > 0 ? (block[0] ?? '').trim() : '';
    const timing = block[timingIdx] ?? '';
    const [lhs, rhs] = timing.split('-->');
    const start = parseTimestamp((lhs ?? '').trim());
    const endRaw = (rhs ?? '').trim().split(/\s+/)[0] ?? '';
    const end = parseTimestamp(endRaw);

    if (start === null || end === null) {
      diagnostics.push(warn('malformed-timestamp', blockStart + timingIdx + 1, 'A lyric line had an unreadable time and was skipped.'));
      continue;
    }

    raw.push({
      id: id || `cue-${++ordinal}`,
      start,
      end,
      payload: block.slice(timingIdx + 1).join('\n'),
      line: blockStart + 1,
    });
  }

  if (raw.length === 0) {
    diagnostics.push(warn('no-cues', null, 'The file loaded but contains no lyric lines, so no words will be shown.'));
    return { ok: true, lines: [], diagnostics };
  }

  // --- repair, then build ----------------------------------------------
  const { kept, diagnostics: repairDiags } = repairCues(raw, opts.mediaDuration);
  diagnostics.push(...repairDiags);

  const lines: LyricLine[] = [];
  for (const cue of kept) {
    const { text: display, voice } = sanitizeToDisplayText(cue.payload);
    const tokens = tokensFromInline(cue.payload, cue.start, cue.end, locale)
      ?? deriveTokens(display, cue.start, cue.end, locale);
    lines.push({ id: cue.id, start: cue.start, end: cue.end, text: display, tokens, voice });
  }

  return { ok: true, lines, diagnostics };
}

export { graphemeCount };
