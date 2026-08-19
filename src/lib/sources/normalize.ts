/**
 * Strips the artifacts a URL picks up in transit (FR-106, research D5).
 *
 * These are properties of the TRANSPORT, not of the address: chat clients and
 * mail readers wrap bare URLs in angle brackets, and a URL pasted from the end
 * of a sentence carries the sentence's punctuation. Rejecting those makes the
 * product look broken when the person did nothing wrong.
 *
 * Deliberately NOT done here: guessing a scheme. Turning `example.com/x` into
 * `https://example.com/x` is the kind of helpfulness that silently sends a
 * request somewhere the person did not name. FR-105 wants unusable text
 * reported, not repaired into a guess.
 */

const TRAILING_PUNCTUATION = '.,;:!?';

function count(haystack: string, needle: string): number {
  let n = 0;
  for (const ch of haystack) if (ch === needle) n++;
  return n;
}

/** Pure, total, idempotent. */
export function normalizeAddress(raw: string): string {
  let s = raw.trim();

  /**
   * Everything loops together until the string stops changing.
   *
   * The bracket strip CANNOT be a one-shot pass before this loop: given
   * "<https://x/y.vtt>." the trailing '.' means the string does not end in '>',
   * so the strip is skipped; the punctuation pass then removes the '.', leaving
   * "<https://x/y.vtt>" — which a second call would strip further. That is a
   * function whose output depends on how many times you call it. Convergence
   * here is what makes idempotence hold, and the unit test pins it.
   */
  for (;;) {
    const before = s;

    s = s.trim();

    if (s.startsWith('<') && s.endsWith('>')) s = s.slice(1, -1).trim();

    while (s.length > 0 && TRAILING_PUNCTUATION.includes(s[s.length - 1]!)) {
      s = s.slice(0, -1);
    }

    // Only an UNBALANCED trailer. Addresses ending in ')' are real —
    // https://en.wikipedia.org/wiki/Foo_(bar) is the case that makes an
    // unconditional strip a corruption rather than a courtesy.
    if (s.endsWith(')') && count(s, ')') > count(s, '(')) {
      s = s.slice(0, -1);
    }

    if (s === before) return s;
  }
}
