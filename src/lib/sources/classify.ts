import type { FailureCategory } from './types.js';

/**
 * Maps what the platform actually told us onto the closed category set
 * (research D4).
 *
 * The governing constraint: the browser will NOT tell us whether a cross-origin
 * fetch was refused or the host was simply unreachable. Both surface as a bare
 * `TypeError` with no detail — deliberately, since distinguishing them would
 * leak information about networks the page cannot see. So one category names
 * both possibilities honestly rather than guessing at one and stating it as
 * fact. See `messages.ts` for how that reads to a person.
 */

/** Status codes are the one place the platform is generous with detail. */
function fromStatus(status: number): FailureCategory {
  if (status === 401 || status === 403) return 'forbidden';
  if (status === 404 || status === 410) return 'not-found';
  return 'server-error';
}

export function classifyFetchFailure(
  error: unknown,
  response: Response | null,
  abortedByDeadline: boolean,
): FailureCategory {
  if (abortedByDeadline) return 'timed-out';
  if (response && !response.ok) return fromStatus(response.status);
  // Everything the fetch spec funnels into TypeError: DNS failure, connection
  // refused, CORS refusal, CSP block. Indistinguishable by design.
  if (error instanceof TypeError) return 'refused-or-unreachable';
  return 'refused-or-unreachable';
}

/**
 * `hasPlayed` splits "this never worked" from "this stopped working", which
 * changes what the person should do about it (FR-120).
 */
export function classifyMediaError(code: number | undefined, hasPlayed: boolean): FailureCategory {
  switch (code) {
    case 2: // MEDIA_ERR_NETWORK
      return 'interrupted';
    case 3: // MEDIA_ERR_DECODE
    case 4: // MEDIA_ERR_SRC_NOT_SUPPORTED
      return 'unplayable-video';
    default:
      return hasPlayed ? 'interrupted' : 'unplayable-video';
  }
}
