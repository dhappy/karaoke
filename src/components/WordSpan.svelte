<script lang="ts">
  import type { WordToken } from '../lib/vtt/types.js';

  /**
   * Research D3 — two pixel-identical stacked layers, the sung one revealed by a
   * clip-path driven by --p.
   *
   * Per-WORD rather than per-line because lines wrap: a single horizontal clip
   * across a line is meaningless once the line breaks onto a second row.
   *
   * Constitution/Quality Standards: the fill BOUNDARY POSITION is a second state
   * channel alongside colour, so sung/unsung is never carried by colour alone.
   */
  interface Props {
    token: WordToken;
    state: 'sung' | 'active' | 'unsung';
  }
  let { token, state }: Props = $props();

  // Initial value only. Once mounted, applyRenderState writes --p directly on
  // this element every frame — routing it through $state would re-diff the tree
  // sixty times a second and fail SC-003 (Constitution III).
  // svelte-ignore state_referenced_locally
  // Capturing only the INITIAL value is the point, not an oversight: after mount,
  // applyRenderState owns --p and writes it imperatively each frame. Making this
  // reactive would reintroduce the 60Hz re-diff that Constitution III forbids.
  const initial = state === 'sung' ? 1 : 0;
</script>

<span
  class="word"
  data-word
  data-token-index={token.index}
  style:--p={initial}
>
  <span class="layer unsung" aria-hidden="true">{token.text}</span>
  <span class="layer sung" aria-hidden="true">{token.text}</span>
  <span class="sr">{token.text}</span>
</span>

<style>
  .word {
    position: relative;
    display: inline-block;
    white-space: pre;
  }

  .layer {
    display: block;
    -webkit-text-stroke: 0.06em var(--scrim-solid);
    paint-order: stroke fill;
    text-shadow:
      0 1px 2px rgb(0 0 0 / 0.9),
      0 0 0.4em rgb(0 0 0 / 0.6);
  }

  .unsung { color: var(--unsung); }

  .sung {
    position: absolute;
    inset: 0;
    color: var(--sung);
    /* The fill boundary. Compositor-friendly, and the only thing that changes
       between frames. */
    clip-path: inset(0 calc((1 - var(--p)) * 100%) 0 0);
  }

  /* One accessible copy of the text; the two visual layers are aria-hidden so a
     screen reader does not read every word twice. */
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
