<script lang="ts">
  import type { LyricLine } from '../lib/vtt/types.js';
  import WordSpan from './WordSpan.svelte';

  interface Props {
    line: LyricLine;
    activeTokenIndex: number;
    emphasis: 'active' | 'preview';
  }
  let { line, activeTokenIndex, emphasis }: Props = $props();

  function stateFor(i: number): 'sung' | 'active' | 'unsung' {
    if (emphasis === 'preview') return 'unsung';
    if (i < activeTokenIndex) return 'sung';
    if (i === activeTokenIndex) return 'active';
    return 'unsung';
  }
</script>

<p class="line" class:preview={emphasis === 'preview'} data-line-id={line.id} data-emphasis={emphasis}>
  {#each line.tokens as token (token.index)}<WordSpan {token} state={stateFor(token.index)} /><span
      class="sep"
      aria-hidden="true"
    >&nbsp;</span>{/each}
</p>

<style>
  .line {
    margin: 0;
    /* Wrapping is the LINE's job. The clip is per word, so wrapping needs no
       special handling — the case a whole-line clip would break. */
    text-wrap: pretty;
    line-height: 1.25;
    font-size: calc(var(--text-size) * var(--text-scale));
    font-weight: 700;
    letter-spacing: 0.01em;
  }

  .preview {
    font-size: calc(var(--text-size) * var(--text-scale) * 0.58);
    font-weight: 600;
    opacity: 0.75;
  }

  .preview :global(.unsung) { color: var(--preview); }
  .preview :global(.sung) { display: none; }

  .sep { display: inline; }
</style>
