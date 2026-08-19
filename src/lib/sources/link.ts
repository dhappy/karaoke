import { validateAddress } from './validate.js';
import type { LinkCompleteness, ShareLink } from './types.js';

/**
 * The share link's codec (FR-122 – FR-130).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * The payload belongs in the URL FRAGMENT and nowhere else (research D1).
 *
 * This is a Constitution II requirement, not a formatting choice. The site is
 * served from GitHub Pages. Had the pairing ridden in a query string, every
 * opened link would have written what that person was about to sing into the
 * access logs of a host they never named. The fragment is the one part of a URL
 * that browsers keep to themselves: never in the request line, never in
 * `Referer`.
 *
 * This module encodes and decodes STRINGS. It never reads or writes
 * `location` — eslint.config.js enforces that — because the caller owns
 * navigation and because a codec that reaches for live browser state stops
 * being provable in node.
 * ────────────────────────────────────────────────────────────────────────────
 */

/** A ten-minute offset is a mistake or a joke; unclamped it would blank the overlay. */
export const MAX_OFFSET_SECONDS = 600;

export const EMPTY_LINK: ShareLink = { video: null, lyrics: null, offset: 0 };

function clampOffset(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(-MAX_OFFSET_SECONDS, Math.min(MAX_OFFSET_SECONDS, n));
}

/**
 * Returns the fragment body WITHOUT a leading '#'.
 *
 * Key order is fixed at v, l, o so an unchanged pairing produces an unchanged
 * string — otherwise the address bar would churn on every reflection.
 */
export function encodeLink(link: ShareLink): string {
  const params = new URLSearchParams();
  if (link.video) params.set('v', link.video);
  if (link.lyrics) params.set('l', link.lyrics);
  // Omitted at zero so the common link stays short and readable.
  const offset = clampOffset(link.offset);
  if (offset !== 0) params.set('o', String(offset));
  return params.toString();
}

/**
 * TOTAL. Any input — empty, truncated, binary garbage, hostile — yields a valid
 * ShareLink rather than throwing. This is Constitution IV's parser-totality rule
 * applied to the second untrusted entry point.
 *
 * `pageProtocol` is threaded through to `validateAddress` so a link cannot
 * smuggle in a scheme the app would refuse from a text field. An address from a
 * link is exactly as untrusted as one typed by hand (FR-129).
 */
export function decodeLink(fragment: string, pageProtocol: string): ShareLink {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(fragment.startsWith('#') ? fragment.slice(1) : fragment);
  } catch {
    return EMPTY_LINK;
  }

  // `URLSearchParams.get` already returns the FIRST of repeated keys, which is
  // the deterministic behaviour the contract requires.
  const pick = (key: string): string | null => {
    const raw = params.get(key);
    if (raw === null || raw === '') return null;
    // One bad half must not cost the good half (FR-130).
    return validateAddress(raw, pageProtocol).ok ? raw : null;
  };

  const rawOffset = params.get('o');
  const offset = rawOffset === null ? 0 : clampOffset(Number(rawOffset));

  return { video: pick('v'), lyrics: pick('l'), offset };
}

/**
 * A link that silently restores nothing is worse than a refusal, which is why
 * 'empty' is a distinct outcome rather than just an empty string (FR-127).
 */
export function linkCompleteness(link: ShareLink): LinkCompleteness {
  if (link.video && link.lyrics) return 'complete';
  if (link.video || link.lyrics) return 'partial';
  return 'empty';
}

/** Names the half a partial link is missing, for the copy action's message. */
export function missingHalf(link: ShareLink): 'video' | 'lyrics' | null {
  if (link.video && !link.lyrics) return 'lyrics';
  if (link.lyrics && !link.video) return 'video';
  return null;
}
