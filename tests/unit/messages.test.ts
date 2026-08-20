import { describe, it, expect } from 'vitest';
import { messageFor } from '../../src/lib/sources/messages.js';
import { ALL_FAILURE_CATEGORIES, type SourceSlot } from '../../src/lib/sources/types.js';

const SLOTS: SourceSlot[] = ['video', 'lyrics'];

describe('messageFor', () => {
  it('is total over the closed category set', () => {
    for (const category of ALL_FAILURE_CATEGORIES) {
      for (const slot of SLOTS) {
        const m = messageFor(category, slot);
        expect(m, `${category}/${slot}`).toBeTruthy();
        expect(typeof m).toBe('string');
      }
    }
  });

  /**
   * Constitution IV / FR-111 — the guarantee most likely to erode.
   *
   * The CATEGORY is the only thing permitted to cross from the network into a
   * message. The moment someone interpolates `response.statusText` "to be more
   * helpful", untrusted remote text is rendering in the UI.
   */
  it('never leaks response text, status codes, or exception text', () => {
    const forbidden = [
      'Failed to fetch', 'TypeError', 'Error:', 'undefined', 'null',
      '404', '403', '401', '500', 'CORS', 'Access-Control', 'ERR_',
    ];
    // A stack frame, not the English word "that" — an earlier version of this
    // list used the bare needle 'at ' and flagged "That is not a web address".
    const stackFrame = /\bat \w+[.(]|\bat <anonymous>/;

    for (const category of ALL_FAILURE_CATEGORIES) {
      for (const slot of SLOTS) {
        const m = messageFor(category, slot);
        for (const needle of forbidden) {
          expect(m, `${category}/${slot} contains ${needle}`).not.toContain(needle);
        }
        expect(m, `${category}/${slot} looks like a stack frame`).not.toMatch(stackFrame);
      }
    }
  });

  it('never embeds an address', () => {
    // Addresses are shown separately as data (FR-115). Interpolating
    // attacker-supplied text into a sentence is the injection this prevents.
    for (const category of ALL_FAILURE_CATEGORIES) {
      for (const slot of SLOTS) {
        const m = messageFor(category, slot);
        expect(m).not.toContain('http://');
        expect(m).not.toContain('https://');
        expect(m).not.toMatch(/\{|\}|\$\{/);
      }
    }
  });

  it('names a next step, not only a fault', () => {
    // Constitution IV: "Every failure surfaced to a person MUST name what went
    // wrong and what they can do about it."
    const actionable = /\b(try|check|ask|download|choose|paste|again)\b/i;
    for (const category of ALL_FAILURE_CATEGORIES) {
      for (const slot of SLOTS) {
        expect(messageFor(category, slot), `${category}/${slot}`).toMatch(actionable);
      }
    }
  });

  it('identifies which source failed, so the two are tellable apart (SC-105)', () => {
    // Categories that can apply to either slot must read differently per slot.
    const sharedCategories = [
      'unusable-address', 'insecure-address', 'streaming-page',
      'refused-or-unreachable', 'not-found', 'forbidden', 'server-error', 'timed-out',
    ] as const;
    for (const category of sharedCategories) {
      const v = messageFor(category, 'video');
      const l = messageFor(category, 'lyrics');
      expect(v, category).not.toBe(l);
      expect(v, category).toContain('video');
      expect(l, category).toContain('lyric');
    }
  });

  it('names BOTH possibilities for the category the browser will not disambiguate', () => {
    // research D4: a TypeError could be a CORS refusal or a dead host, and the
    // platform hides which. The message must not pick one and assert it.
    const m = messageFor('refused-or-unreachable', 'lyrics');
    expect(m).toMatch(/may not allow/i);
    expect(m).toMatch(/or/i);
    expect(m).toMatch(/unreachable/i);
  });
});
