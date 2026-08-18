/**
 * FR-023 + research D6: script-correct segmentation via Intl.Segmenter.
 *
 * Splitting on /\s+/ fails Japanese, Thai, and Chinese outright; splitting on
 * code units breaks emoji ZWJ sequences, Devanagari conjuncts, and combining
 * marks — the visible symptom being a highlight boundary that bisects a glyph.
 *
 * Intl.Segmenter availability is what sets this project's browser floor. That is
 * a recorded consequence, not an accident.
 */

export interface Segment {
  readonly text: string;
  /** Weight used for duration distribution: grapheme count, not code-unit length. */
  readonly weight: number;
}

const wordSegmenters = new Map<string, Intl.Segmenter>();
const graphemeSegmenters = new Map<string, Intl.Segmenter>();

function wordSegmenter(locale: string): Intl.Segmenter {
  let s = wordSegmenters.get(locale);
  if (!s) {
    s = new Intl.Segmenter(locale, { granularity: 'word' });
    wordSegmenters.set(locale, s);
  }
  return s;
}

function graphemeSegmenter(locale: string): Intl.Segmenter {
  let s = graphemeSegmenters.get(locale);
  if (!s) {
    s = new Intl.Segmenter(locale, { granularity: 'grapheme' });
    graphemeSegmenters.set(locale, s);
  }
  return s;
}

/** Grapheme-cluster count. Never String.length — that splits emoji and conjuncts. */
export function graphemeCount(text: string, locale = 'en'): number {
  let n = 0;
  // Iterating the segmenter is the count; the segment values are not needed.
  for (const _seg of graphemeSegmenter(locale).segment(text)) {
    void _seg;
    n++;
  }
  return n;
}

/**
 * Splits display text into word-like segments. Whitespace and punctuation
 * segments are dropped: they are not sung and must not receive a highlight slot.
 */
export function segmentWords(text: string, locale = 'en'): Segment[] {
  const out: Segment[] = [];
  for (const seg of wordSegmenter(locale).segment(text)) {
    if (!seg.isWordLike) continue;
    const t = seg.segment;
    if (t.trim() === '') continue;
    out.push({ text: t, weight: graphemeCount(t, locale) });
  }
  return out;
}

