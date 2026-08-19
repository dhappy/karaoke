import { classifyFetchFailure } from './classify.js';
import type { RetrieveResult } from './types.js';

/** Lyric files are tens of kilobytes; 20s of no arrival means something is wrong (D8). */
export const DEFAULT_DEADLINE_MS = 20_000;

export interface RetrieveOptions {
  /** The caller's abort signal — abandonment when a newer source claims the slot. */
  readonly signal: AbortSignal;
  readonly deadlineMs?: number;
  /** Injected so every branch is reachable from a node test (research D9). */
  readonly fetchImpl?: typeof fetch;
}

/**
 * The one function in src/lib/ that performs I/O.
 *
 * It lives here because it satisfies the letter of Constitution I — no Svelte,
 * no DOM, no media element — and its rationale: with `fetch` injected, abort,
 * deadline, non-ok status, and TypeError are all reachable without a browser.
 *
 * Every property of the request below is a REQUIREMENT, not a default:
 *   credentials: 'omit'          FR-119 — never send cookies or auth
 *   referrerPolicy: 'no-referrer' FR-118 — the host learns nothing about us
 *   redirect: 'follow'            the person should not resolve redirects
 *   mode: 'cors'                  the only mode yielding a readable body
 *
 * And a NON-requirement worth stating: no custom headers. Beyond leaking an
 * identifier, a custom header forces a CORS preflight, turning simple working
 * requests into failures.
 *
 * Never throws. Every rejection becomes a RetrieveResult.
 */
export async function retrieveText(url: URL, opts: RetrieveOptions): Promise<RetrieveResult> {
  const doFetch = opts.fetchImpl ?? globalThis.fetch;
  const deadlineMs = opts.deadlineMs ?? DEFAULT_DEADLINE_MS;

  const deadline = new AbortController();
  let deadlineFired = false;
  const timer = setTimeout(() => {
    deadlineFired = true;
    deadline.abort();
  }, deadlineMs);

  const onCallerAbort = () => deadline.abort();
  opts.signal.addEventListener('abort', onCallerAbort, { once: true });

  try {
    const response = await doFetch(url.href, {
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      redirect: 'follow',
      mode: 'cors',
      signal: deadline.signal,
    });

    if (!response.ok) {
      return { ok: false, failure: classifyFetchFailure(null, response, false) };
    }

    const text = await response.text();

    // The caller may have abandoned us while the body streamed. Reporting a
    // success here would overwrite content the person already replaced.
    if (opts.signal.aborted) return { ok: false, abandoned: true };

    return { ok: true, text };
  } catch (error) {
    // Abandonment is SILENT — never a failure. An error painted for a source the
    // person already replaced is worse than no message at all.
    if (opts.signal.aborted && !deadlineFired) return { ok: false, abandoned: true };
    return { ok: false, failure: classifyFetchFailure(error, null, deadlineFired) };
  } finally {
    // Cleared on every exit path, including the successful one — a stray timer
    // would abort a controller nobody is listening to and keep the event loop
    // alive in tests.
    clearTimeout(timer);
    opts.signal.removeEventListener('abort', onCallerAbort);
  }
}
