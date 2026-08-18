import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { sanitize, sanitizeToDisplayText, decodeEntities } from '../../src/lib/vtt/sanitize.js';
import { parseWebVTT } from '../../src/lib/vtt/parse.js';

/** A real WebVTT tag: `</?name...>` or an inline timestamp. Not any `<...>`. */
const TAG = /<\/?(?:[a-zA-Z][^>]*|\d{1,3}:\d{2}[^>]*)>/;
const ENTITY = /&(?:amp|lt|gt|nbsp|lrm|rlm);/;

const fixture = (n: string) => readFileSync(new URL(`../fixtures/${n}`, import.meta.url), 'utf8');

describe('sanitize', () => {
  it('strips nested formatting tags', () => {
    expect(sanitizeToDisplayText('This <b>is <i>nested</i></b> markup').text).toBe('This is nested markup');
  });

  it('captures the voice name and removes the tag', () => {
    const r = sanitizeToDisplayText('<v Roger Rabbit>Hello there');
    expect(r.voice).toBe('Roger Rabbit');
    expect(r.text).toBe('Hello there');
  });

  it('decodes entities', () => {
    expect(decodeEntities('&amp; &lt; &gt;')).toBe('& < >');
  });

  it('keeps inline timestamps in sanitize but drops them in display text', () => {
    const raw = '<00:00:01.000>Hello <00:00:02.000>world';
    expect(sanitize(raw).text).toContain('<00:00:01.000>');
    expect(sanitizeToDisplayText(raw).text).toBe('Hello world');
  });

  it('decodes entities last, so a decoded < is never re-read as a tag', () => {
    expect(sanitizeToDisplayText('&lt;b&gt;not a tag&lt;/b&gt;').text).toBe('<b>not a tag</b>');
  });
});

describe('contract guarantee 4: no markup escapes', () => {
  it('leaves no WebVTT tag or undecoded entity in any output text', () => {
    for (const name of ['markup.vtt', 'word-timed.vtt', 'overlapping.vtt', 'non-latin.vtt']) {
      const r = parseWebVTT(fixture(name));
      expect(r.ok).toBe(true);
      for (const line of r.lines) {
        // A real WebVTT tag is anchored by a tag NAME or a timestamp. Bare
        // angle brackets from decoded &lt;/&gt; are correct output, and so is
        // the "< >" that "&lt; &gt;" decodes to — see contract guarantee 4.
        expect(line.text).not.toMatch(TAG);
        expect(line.text).not.toMatch(ENTITY);
        for (const tok of line.tokens) {
          expect(tok.text).not.toMatch(TAG);
        }
      }
    }
  });

  it('discards cue settings rather than rendering them', () => {
    const r = parseWebVTT(fixture('markup.vtt'));
    for (const line of r.lines) {
      expect(line.text).not.toContain('align:');
      expect(line.text).not.toContain('position:');
    }
  });

  it('skips STYLE and REGION blocks', () => {
    const r = parseWebVTT(fixture('markup.vtt'));
    expect(r.lines.some((l) => l.text.includes('papayawhip'))).toBe(false);
    expect(r.lines.some((l) => l.text.includes('width:40%'))).toBe(false);
  });
});
