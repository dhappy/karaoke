import { isStreamingHost, looksLikeDirectMedia } from './hosts.js';
import type { ValidateResult } from './types.js';

/**
 * Decides whether an address is worth contacting — WITHOUT contacting it
 * (FR-105). Three of the eleven failure categories are reachable here, and they
 * are exactly the three that would otherwise be indistinguishable after a
 * failed request.
 *
 * `pageProtocol` is a PARAMETER rather than a read of `location.protocol`
 * because this module is pure: Constitution I forbids navigation globals in
 * src/lib/, and eslint.config.js enforces it. Passing it in is also what makes
 * the mixed-content branch testable in node.
 */
export function validateAddress(normalized: string, pageProtocol: string): ValidateResult {
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    return { ok: false, failure: 'unusable-address' };
  }

  // `javascript:` and `data:` must never reach a load path; `file:` and `blob:`
  // are not addresses a person types for this purpose. Everything that is not
  // plain web retrieval is refused here, at the boundary.
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, failure: 'unusable-address' };
  }

  // Caught here rather than after a failed request: the browser's mixed-content
  // block is not distinguishable from a network failure once it has happened,
  // so this is the only point at which the person can be told the real reason.
  if (pageProtocol === 'https:' && url.protocol === 'http:') {
    return { ok: false, failure: 'insecure-address' };
  }

  // A direct media file hosted on a streaming domain is still a direct media
  // file. The host list narrows the message; it never blocks a real load.
  if (isStreamingHost(url.hostname) && !looksLikeDirectMedia(url.pathname)) {
    return { ok: false, failure: 'streaming-page' };
  }

  return { ok: true, url };
}
