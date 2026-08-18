import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseWebVTT, parseTimestamp } from '../../src/lib/vtt/parse.js';

const fixture = (n: string) => readFileSync(new URL(`../fixtures/${n}`, import.meta.url), 'utf8');
const EPS = 1e-9;

/** Deterministic pseudo-binary input; built at runtime so no control bytes live in source. */
const binaryGarbage = String.fromCharCode(...Array.from({ length: 512 }, (_, i) => (i * 37) % 256));

describe('parseTimestamp', () => {
  it('reads h:mm:ss.mmm', () => expect(parseTimestamp('01:02:03.500')).toBeCloseTo(3723.5));
  it('reads mm:ss.mmm short form', () => expect(parseTimestamp('02:03.250')).toBeCloseTo(123.25));
  it('returns null rather than throwing on rubbish', () => expect(parseTimestamp('aa:bb.ccc')).toBeNull());
});

describe('contract guarantee 1: totality', () => {
  const inputs: [string, string][] = [
    ['empty string', ''],
    ['whitespace only', '   \n\n  '],
    ['binary garbage', binaryGarbage],
    ['header only', 'WEBVTT'],
    ['truncated mid-cue', 'WEBVTT\n\n00:00:01.000 -->'],
    ['arrow with no times', 'WEBVTT\n\n-->\ntext'],
    ['lookalike header', 'WEBVTTX'],
    ['huge timestamp', 'WEBVTT\n\n999:59:59.999 --> 999:59:59.999\nx'],
  ];

  it.each(inputs)('never throws for %s', (_label, input) => {
    expect(() => parseWebVTT(input)).not.toThrow();
  });

  it('always returns a well-formed result shape', () => {
    for (const [, input] of inputs) {
      const r = parseWebVTT(input);
      expect(Array.isArray(r.lines)).toBe(true);
      expect(Array.isArray(r.diagnostics)).toBe(true);
      if (!r.ok) expect(r.lines.length).toBe(0);
    }
  });
});

describe('fatal vs recoverable', () => {
  it('treats a missing WEBVTT header as fatal', () => {
    const r = parseWebVTT('00:00:01.000 --> 00:00:02.000\nhello');
    expect(r.ok).toBe(false);
    expect(r.diagnostics[0]!.code).toBe('missing-webvtt-header');
  });

  it('treats an empty file as fatal', () => {
    expect(parseWebVTT('').diagnostics[0]!.code).toBe('empty-file');
  });

  it('loads a valid file with zero cues without error', () => {
    const r = parseWebVTT(fixture('empty.vtt'));
    expect(r.ok).toBe(true);
    expect(r.lines).toEqual([]);
    expect(r.diagnostics.some((d) => d.code === 'no-cues')).toBe(true);
  });
});

describe('FR-003: inline word timings', () => {
  const r = parseWebVTT(fixture('word-timed.vtt'));

  it('marks tokens as read-from-file, not derived', () => {
    expect(r.lines[0]!.tokens.every((t) => !t.derived)).toBe(true);
  });

  it('uses the file timings verbatim', () => {
    const toks = r.lines[0]!.tokens;
    expect(toks[0]!.text).toBe('Hello');
    expect(toks[0]!.start).toBeCloseTo(1.0);
    expect(toks[1]!.start).toBeCloseTo(1.8);
    expect(toks[4]!.text).toBe('friend');
    expect(toks[4]!.end).toBeCloseTo(4.0);
  });
});

describe('SC-009 + contract guarantee 3: derived tokens cover the line with no gaps', () => {
  const r = parseWebVTT(fixture('line-only.vtt'));

  it('derives every token', () => {
    expect(r.lines.every((l) => l.tokens.every((t) => t.derived))).toBe(true);
  });

  it('starts at the line start and ends at the line end', () => {
    for (const line of r.lines) {
      expect(line.tokens[0]!.start).toBeCloseTo(line.start, 9);
      expect(line.tokens.at(-1)!.end).toBeCloseTo(line.end, 9);
    }
  });

  it('leaves no gap or overlap between consecutive tokens', () => {
    for (const line of r.lines) {
      for (let i = 1; i < line.tokens.length; i++) {
        expect(Math.abs(line.tokens[i]!.start - line.tokens[i - 1]!.end)).toBeLessThan(EPS);
      }
    }
  });

  it('gives longer words more time than shorter ones', () => {
    const line = r.lines[1]!;
    const long = line.tokens.find((t) => t.text === 'Extraordinarily')!;
    const short = line.tokens.find((t) => t.text === 'a')!;
    expect(long.end - long.start).toBeGreaterThan(short.end - short.start);
  });
});

describe('contract guarantees 2 and 3: ordering and token containment', () => {
  it.each([
    'word-timed.vtt',
    'line-only.vtt',
    'overlapping.vtt',
    'malformed.vtt',
    'non-latin.vtt',
    'markup.vtt',
  ])('holds for %s', (name) => {
    const r = parseWebVTT(fixture(name));
    const starts = r.lines.map((l) => l.start);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    for (const line of r.lines) {
      expect(line.end).toBeGreaterThan(line.start);
      for (const t of line.tokens) {
        expect(t.start).toBeGreaterThanOrEqual(line.start - EPS);
        expect(t.end).toBeLessThanOrEqual(line.end + EPS);
        expect(t.end).toBeGreaterThanOrEqual(t.start);
      }
    }
  });
});

describe('contract guarantee 7: determinism', () => {
  it('produces identical output for identical input', () => {
    const a = parseWebVTT(fixture('word-timed.vtt'));
    const b = parseWebVTT(fixture('word-timed.vtt'));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('FR-019: overlapping cues both survive parsing', () => {
  it('keeps duet lines as separate entries', () => {
    const r = parseWebVTT(fixture('overlapping.vtt'));
    const lead = r.lines.find((l) => l.id === 'lead')!;
    const harmony = r.lines.find((l) => l.id === 'harmony')!;
    expect(lead).toBeDefined();
    expect(harmony).toBeDefined();
    expect(harmony.start).toBeLessThan(lead.end);
  });
});
