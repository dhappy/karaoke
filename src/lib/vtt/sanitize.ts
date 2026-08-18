/**
 * FR-018: strip WebVTT markup, voice/speaker annotations, and positioning hints
 * so no markup is ever visible as literal characters.
 *
 * Operates on raw cue payload text. Inline timestamps (<00:00:12.500>) are NOT
 * touched here — parse.ts needs them and removes them itself once consumed.
 */

const ENTITIES: ReadonlyMap<string, string> = new Map([
  ['&amp;', '&'],
  ['&lt;', '<'],
  ['&gt;', '>'],
  ['&nbsp;', ' '],
  ['&lrm;', '‎'],
  ['&rlm;', '‏'],
]);

/** A tag is a timestamp tag when its body is a bare WebVTT timestamp. */
const TIMESTAMP_TAG = /^<\d{1,3}:\d{2}(?::\d{2})?\.\d{1,3}>$/;

export interface SanitizeResult {
  readonly text: string;
  /** Speaker captured from the first <v Name> span, if any. */
  readonly voice: string | null;
}

export function decodeEntities(input: string): string {
  return input.replace(/&(?:amp|lt|gt|nbsp|lrm|rlm);/g, (m) => ENTITIES.get(m) ?? m);
}

/**
 * Removes every tag except inline timestamps, capturing the voice name.
 * Entity decoding happens last so a decoded `&lt;` can never be re-read as a tag.
 */
export function sanitize(raw: string): SanitizeResult {
  let voice: string | null = null;

  const stripped = raw.replace(/<[^>]*>/g, (tag) => {
    if (TIMESTAMP_TAG.test(tag)) return tag;
    const v = /^<v(?:\.[^\s>]*)*\s+([^>]*)>$/.exec(tag);
    if (v && voice === null) voice = v[1]!.trim() || null;
    return '';
  });

  return { text: decodeEntities(stripped), voice };
}

/** Sanitize and also drop inline timestamps — the display-text form. */
export function sanitizeToDisplayText(raw: string): SanitizeResult {
  const { text, voice } = sanitize(raw);
  return { text: text.replace(/<\d{1,3}:\d{2}(?::\d{2})?\.\d{1,3}>/g, '').trim(), voice };
}
