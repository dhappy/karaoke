import { describe, it, expect } from 'vitest';
import { classifyFetchFailure, classifyMediaError } from '../../src/lib/sources/classify.js';
import { ALL_FAILURE_CATEGORIES, type FailureCategory } from '../../src/lib/sources/types.js';

function res(status: number): Response {
  return { ok: status >= 200 && status < 300, status } as Response;
}

describe('classifyFetchFailure', () => {
  it('reports the deadline before anything else', () => {
    // The deadline fires by aborting, so the catch sees an AbortError. If the
    // ordering here regressed, every timeout would read as "unreachable".
    expect(classifyFetchFailure(new Error('aborted'), null, true)).toBe('timed-out');
  });

  it('maps status codes to distinct categories', () => {
    expect(classifyFetchFailure(null, res(401), false)).toBe('forbidden');
    expect(classifyFetchFailure(null, res(403), false)).toBe('forbidden');
    expect(classifyFetchFailure(null, res(404), false)).toBe('not-found');
    expect(classifyFetchFailure(null, res(410), false)).toBe('not-found');
    expect(classifyFetchFailure(null, res(500), false)).toBe('server-error');
    expect(classifyFetchFailure(null, res(503), false)).toBe('server-error');
    expect(classifyFetchFailure(null, res(418), false)).toBe('server-error');
  });

  it('maps a TypeError to the honest both-possibilities category', () => {
    // The browser will not tell us whether this was a CORS refusal or a dead
    // host. Claiming either specifically would be a guess stated as a fact.
    expect(classifyFetchFailure(new TypeError('Failed to fetch'), null, false))
      .toBe('refused-or-unreachable');
  });

  it('falls back to refused-or-unreachable for an unrecognized rejection', () => {
    expect(classifyFetchFailure({ weird: true }, null, false)).toBe('refused-or-unreachable');
  });
});

describe('classifyMediaError', () => {
  it('maps MediaError codes', () => {
    expect(classifyMediaError(2, false)).toBe('interrupted'); // NETWORK
    expect(classifyMediaError(3, false)).toBe('unplayable-video'); // DECODE
    expect(classifyMediaError(4, false)).toBe('unplayable-video'); // SRC_NOT_SUPPORTED
  });

  it('uses hasPlayed to split "never worked" from "stopped working"', () => {
    // FR-120: the same absent code means different things either side of the
    // first frame, and the person needs a different action for each.
    expect(classifyMediaError(undefined, false)).toBe('unplayable-video');
    expect(classifyMediaError(undefined, true)).toBe('interrupted');
  });
});

describe('the category set', () => {
  it('is exhaustively reachable', () => {
    // A category nothing can produce is dead text in the UI. Three are
    // pre-network (validate.ts), two are content-level, and the rest arrive here.
    const reachable = new Set<FailureCategory>([
      classifyFetchFailure(new Error('x'), null, true),
      classifyFetchFailure(null, res(401), false),
      classifyFetchFailure(null, res(404), false),
      classifyFetchFailure(null, res(500), false),
      classifyFetchFailure(new TypeError('x'), null, false),
      classifyMediaError(3, false),
      classifyMediaError(2, false),
      // Produced elsewhere, listed so the accounting below is honest:
      'unusable-address',
      'insecure-address',
      'streaming-page',
      'unreadable-lyrics',
    ]);
    expect([...reachable].sort()).toEqual([...ALL_FAILURE_CATEGORIES].sort());
  });
});
