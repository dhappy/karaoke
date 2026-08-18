import type { RenderState } from '../lib/timing/types.js';

/**
 * Constitution III — the per-frame hot path.
 *
 * Writes --p directly to the DOM. It MUST NOT touch reactive state: routing a
 * 60Hz scalar through runes would invalidate and re-diff the overlay tree sixty
 * times a second for a change that affects one custom property on one element.
 *
 * Cost per frame is bounded by a small constant, independent of line length and
 * file size: words before the active one are pinned at 1, words after at 0, and
 * only the boundary moves.
 */

const FULL = '1';
const NONE = '0';

/** Cache of the last value written per element, so we never write a no-op. */
const lastWritten = new WeakMap<HTMLElement, string>();

function setP(el: HTMLElement, value: string, force: boolean): void {
  if (!force && lastWritten.get(el) === value) return;
  el.style.setProperty('--p', value);
  lastWritten.set(el, value);
}

/**
 * @param root  the overlay element containing the active lines
 * @param state the frame's resolved render state
 * @param force bypass the write cache. REQUIRED on any frame where the overlay's
 *   structure just changed: Svelte may reuse a DOM element for a different token,
 *   and it re-applies each WordSpan's initial `--p` on re-render, so the cache's
 *   record of what we last wrote no longer describes the element in front of us.
 */
export function applyRenderState(
  root: HTMLElement | null,
  state: RenderState,
  force = false,
): void {
  if (!root) return;

  for (const active of state.active) {
    // Must match the ACTIVE line specifically — a preview line carries a
    // data-line-id too, and writing the sung fill into it puts the highlight on
    // the wrong line entirely.
    const lineEl = root.querySelector<HTMLElement>(
      `[data-emphasis="active"][data-line-id="${CSS.escape(active.line.id)}"]`,
    );
    if (!lineEl) continue;

    const words = lineEl.querySelectorAll<HTMLElement>('[data-word]');
    for (let i = 0; i < words.length; i++) {
      const el = words[i]!;
      if (i < active.activeTokenIndex) setP(el, FULL, force);
      else if (i > active.activeTokenIndex) setP(el, NONE, force);
      else setP(el, active.fill >= 1 ? FULL : active.fill <= 0 ? NONE : String(active.fill), force);
    }
  }
}

