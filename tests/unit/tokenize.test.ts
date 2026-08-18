import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { segmentWords, graphemeCount } from '../../src/lib/vtt/tokenize.js';
import { parseWebVTT } from '../../src/lib/vtt/parse.js';

const fixture = (n: string) => readFileSync(new URL(`../fixtures/${n}`, import.meta.url), 'utf8');

describe('graphemeCount', () => {
  it('counts ZWJ emoji families as one grapheme, not many code units', () => {
    const family = '👨‍👩‍👧‍👦';
    expect(family.length).toBeGreaterThan(4);
    expect(graphemeCount(family)).toBe(1);
  });

  it('counts Devanagari conjuncts as single clusters', () => {
    expect(graphemeCount('नमस्ते')).toBeLessThan('नमस्ते'.length);
  });
});

describe('segmentWords', () => {
  it('splits space-delimited text', () => {
    expect(segmentWords('hello darkness my old friend').map((s) => s.text))
      .toEqual(['hello', 'darkness', 'my', 'old', 'friend']);
  });

  it('splits Japanese, which has no spaces', () => {
    const segs = segmentWords('こんにちは世界', 'ja');
    expect(segs.length).toBeGreaterThan(1);
    expect(segs.map((s) => s.text).join('')).toBe('こんにちは世界');
  });

  it('drops punctuation and whitespace rather than giving them highlight slots', () => {
    expect(segmentWords('hi, there!').map((s) => s.text)).toEqual(['hi', 'there']);
  });
});

describe('FR-023: no token boundary falls inside a grapheme cluster', () => {
  it('holds across the non-Latin corpus', () => {
    const r = parseWebVTT(fixture('non-latin.vtt'), { locale: 'ja' });
    expect(r.ok).toBe(true);
    expect(r.lines.length).toBe(4);

    for (const line of r.lines) {
      for (const tok of line.tokens) {
        // Re-segmenting a token must reproduce it exactly: if a boundary had
        // split a cluster, the token would contain a partial cluster and the
        // grapheme walk would not round-trip.
        const clusters = [...new Intl.Segmenter('ja', { granularity: 'grapheme' }).segment(tok.text)]
          .map((s) => s.segment);
        expect(clusters.join('')).toBe(tok.text);
        expect(clusters.every((c) => c.length > 0)).toBe(true);
      }
    }
  });

  it('keeps the emoji family intact as a single token', () => {
    const r = parseWebVTT(fixture('non-latin.vtt'));
    const emojiLine = r.lines.find((l) => l.text.includes('👨'));
    expect(emojiLine).toBeDefined();
    expect(emojiLine!.text).toContain('👨‍👩‍👧‍👦');
  });
});
