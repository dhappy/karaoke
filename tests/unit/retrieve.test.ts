import { describe, it, expect, vi } from 'vitest';
import { retrieveText } from '../../src/lib/sources/retrieve.js';

const URL_OK = new URL('https://example.com/song.vtt');

function ok(text: string): Response {
  return { ok: true, status: 200, text: async () => text } as Response;
}
function status(code: number): Response {
  return { ok: false, status: code, text: async () => '' } as Response;
}

describe('retrieveText', () => {
  it('returns the body on success', async () => {
    const fetchImpl = vi.fn(async () => ok('WEBVTT\n\n')) as unknown as typeof fetch;
    const r = await retrieveText(URL_OK, { signal: new AbortController().signal, fetchImpl });
    expect(r).toEqual({ ok: true, text: 'WEBVTT\n\n' });
  });

  /**
   * FR-118 / FR-119 — each of these is a requirement, not a default.
   *
   * A custom header would also force a CORS preflight, turning simple working
   * requests into failures, so "send nothing extra" is the functional choice as
   * well as the private one.
   */
  it('sends no credentials, no referrer, and no custom headers', async () => {
    const fetchImpl = vi.fn(async () => ok('WEBVTT')) as unknown as typeof fetch;
    await retrieveText(URL_OK, { signal: new AbortController().signal, fetchImpl });

    const init = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]![1];
    expect(init.credentials).toBe('omit');
    expect(init.referrerPolicy).toBe('no-referrer');
    expect(init.redirect).toBe('follow');
    expect(init.mode).toBe('cors');
    expect(init.headers).toBeUndefined();
  });

  it('maps non-ok statuses to categories', async () => {
    for (const [code, failure] of [[404, 'not-found'], [403, 'forbidden'], [500, 'server-error']] as const) {
      const fetchImpl = vi.fn(async () => status(code)) as unknown as typeof fetch;
      const r = await retrieveText(URL_OK, { signal: new AbortController().signal, fetchImpl });
      expect(r).toEqual({ ok: false, failure });
    }
  });

  it('maps a TypeError to refused-or-unreachable', async () => {
    const fetchImpl = vi.fn(async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch;
    const r = await retrieveText(URL_OK, { signal: new AbortController().signal, fetchImpl });
    expect(r).toEqual({ ok: false, failure: 'refused-or-unreachable' });
  });

  it('gives up at the deadline rather than waiting indefinitely (SC-106)', async () => {
    // Resolves only when its own signal aborts — i.e. never, on its own.
    const fetchImpl = vi.fn((_u: string, init: RequestInit) => new Promise<Response>((_res, rej) => {
      init.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')));
    })) as unknown as typeof fetch;

    const r = await retrieveText(URL_OK, {
      signal: new AbortController().signal,
      deadlineMs: 20,
      fetchImpl,
    });
    expect(r).toEqual({ ok: false, failure: 'timed-out' });
  });

  /**
   * FR-108 — abandonment is SILENT.
   *
   * An error painted for a source the person already replaced is worse than no
   * message: it accuses the new, working source of a failure that belonged to
   * the old one.
   */
  it('reports abandonment as abandoned, never as a failure', async () => {
    const caller = new AbortController();
    const fetchImpl = vi.fn((_u: string, init: RequestInit) => new Promise<Response>((_res, rej) => {
      init.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')));
    })) as unknown as typeof fetch;

    const promise = retrieveText(URL_OK, { signal: caller.signal, fetchImpl });
    caller.abort();
    expect(await promise).toEqual({ ok: false, abandoned: true });
  });

  it('reports abandonment even when the body already arrived', async () => {
    // The race that matters: the fetch resolved, but the person replaced the
    // source while the body was streaming. Committing here would overwrite
    // newer content with older.
    const caller = new AbortController();
    const fetchImpl = vi.fn(async () => {
      caller.abort();
      return ok('WEBVTT');
    }) as unknown as typeof fetch;

    const r = await retrieveText(URL_OK, { signal: caller.signal, fetchImpl });
    expect(r).toEqual({ ok: false, abandoned: true });
  });

  it('never throws, whatever fetch does', async () => {
    for (const thrown of [new Error('x'), 'a string', null, undefined, { odd: true }]) {
      const fetchImpl = vi.fn(async () => { throw thrown; }) as unknown as typeof fetch;
      await expect(
        retrieveText(URL_OK, { signal: new AbortController().signal, fetchImpl }),
      ).resolves.toBeDefined();
    }
  });

  it('clears its deadline timer on the success path', async () => {
    // A stray timer would abort a controller nobody listens to and keep the
    // event loop alive. vitest would hang rather than fail, which is worse.
    const spy = vi.spyOn(globalThis, 'clearTimeout');
    const fetchImpl = vi.fn(async () => ok('WEBVTT')) as unknown as typeof fetch;
    await retrieveText(URL_OK, { signal: new AbortController().signal, fetchImpl });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
