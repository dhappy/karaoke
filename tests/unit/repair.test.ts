import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseWebVTT } from '../../src/lib/vtt/parse.js';
import type { DiagnosticCode } from '../../src/lib/vtt/types.js';

const fixture = (n: string) => readFileSync(new URL(`../fixtures/${n}`, import.meta.url), 'utf8');

describe('FR-020: repair table', () => {
  const r = parseWebVTT(fixture('malformed.vtt'));
  const codes = new Set<DiagnosticCode>(r.diagnostics.map((d) => d.code));

  it('loads rather than aborting — degrade, never abort', () => {
    expect(r.ok).toBe(true);
  });

  it('keeps the good cue', () => {
    expect(r.lines.some((l) => l.text.includes('Perfectly fine cue'))).toBe(true);
  });

  it.each([
    ['inverted-cue'],
    ['zero-length-cue'],
    ['out-of-order-cue'],
    ['malformed-timestamp'],
    ['unparseable-cue-block'],
  ])('diagnoses %s', (code) => {
    expect(codes.has(code as DiagnosticCode)).toBe(true);
  });

  it('swaps an inverted cue rather than dropping it', () => {
    const line = r.lines.find((l) => l.text.includes('Inverted cue'));
    expect(line).toBeDefined();
    expect(line!.end).toBeGreaterThan(line!.start);
  });

  it('skips the zero-length cue entirely — it cannot be highlighted', () => {
    expect(r.lines.some((l) => l.text.includes('Zero length'))).toBe(false);
  });

  it('emits only warnings, never errors, for a repairable file', () => {
    expect(r.diagnostics.every((d) => d.severity === 'warning')).toBe(true);
  });

  it('never echoes file content into a diagnostic message', () => {
    for (const d of r.diagnostics) {
      expect(d.message).not.toContain('Inverted cue');
      expect(d.message).not.toContain('Zero length');
      expect(d.message).not.toContain('Unparseable');
    }
  });
});

describe('cue-beyond-media', () => {
  it('drops cues timed past the end of the video', () => {
    const r = parseWebVTT(fixture('word-timed.vtt'), { mediaDuration: 6 });
    expect(r.diagnostics.some((d) => d.code === 'cue-beyond-media')).toBe(true);
    expect(r.lines.every((l) => l.start < 6)).toBe(true);
  });
});

describe('output ordering', () => {
  it('sorts by start even when the file is out of order', () => {
    const r = parseWebVTT(fixture('malformed.vtt'));
    const starts = r.lines.map((l) => l.start);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });
});
