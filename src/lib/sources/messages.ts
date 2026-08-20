import type { FailureCategory, SourceSlot } from './types.js';

/**
 * The ONLY path from a failure to user-facing text (FR-110, FR-111).
 *
 * Four guarantees, each pinned by tests/unit/messages.test.ts:
 *
 *  1. No response body, status text, header, exception message, or stack
 *     appears here. The CATEGORY is the only thing that crosses from the
 *     network into a message — Constitution IV, and the reason `classify.ts`
 *     returns an enum rather than a string.
 *  2. Every message names what went wrong AND what to do next.
 *  3. Every message identifies WHICH source failed, so a person can tell the
 *     two apart from the wording alone (SC-105).
 *  4. No message contains the address. It is shown separately as data
 *     (FR-115); interpolating attacker-supplied text into a sentence is the
 *     injection this rule exists to prevent.
 */

function noun(slot: SourceSlot): string {
  return slot === 'video' ? 'video' : 'lyric file';
}

export function messageFor(category: FailureCategory, slot: SourceSlot): string {
  const it = noun(slot);

  switch (category) {
    case 'unusable-address':
      return `That is not a web address, so the ${it} could not be loaded. Check it and paste it again.`;

    case 'insecure-address':
      return `That address is not secure, so the browser will not load the ${it} from it. Ask whoever hosts it for an https address, or download the file and choose it here.`;

    case 'streaming-page':
      return `That is a page on a video site, not a ${it}. This player needs a direct address to a media file. Try downloading the file and choosing it here instead.`;

    // Names BOTH possibilities, because the browser will not say which — and the
    // suggested action is the one that resolves either.
    case 'refused-or-unreachable':
      return `The ${it} could not be read from that address. The site may not allow other sites to read its files, or it may be unreachable. Try downloading the file and choosing it here instead.`;

    case 'not-found':
      return `There is nothing at that address, so the ${it} could not be loaded. Check the address, or ask whoever sent it for a new one.`;

    case 'forbidden':
      return `That address needs a permission this player does not have, so the ${it} could not be loaded. Try downloading the file and choosing it here instead.`;

    case 'server-error':
      return `The site hosting that ${it} had a problem and could not send it. Try again in a little while.`;

    case 'timed-out':
      return `The ${it} took too long to arrive, so loading was given up on. Check your connection and try again.`;

    case 'unreadable-lyrics':
      return 'That address returned something that is not readable as lyrics. Check that it points at a WebVTT file.';

    case 'unplayable-video':
      return 'This browser cannot play that video, or the file is damaged. Try an MP4 or WebM file.';

    case 'interrupted':
      return 'The video stopped arriving partway through. Check your connection and try again — your lyrics are still loaded.';
  }
}
