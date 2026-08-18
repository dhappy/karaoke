<script lang="ts">
  import type { CueIndex, RenderState } from '../lib/timing/types.js';
  import LyricLine from './LyricLine.svelte';
  import Countdown from './Countdown.svelte';
  import type { PrefsState } from '../state/prefs.svelte.js';

  /**
   * Reactive at LINE granularity only (Constitution III, research D4).
   *
   * This component must never hold the playhead. `render` changes when the set of
   * visible lines changes — a few times a minute — while the per-frame fill is
   * written imperatively by applyRenderState against `el`.
   */
  interface Props {
    index: CueIndex | null;
    render: RenderState;
    prefs: PrefsState;
    el?: HTMLElement | null;
  }
  let { index, render, prefs, el = $bindable(null) }: Props = $props();
</script>

<div
  class="overlay"
  data-placement={prefs.placement}
  style:--text-scale={prefs.textScale}
  bind:this={el}
>
  {#if render.countdown !== null}
    <Countdown seconds={render.countdown} />
  {/if}

  {#if render.active.length > 0 || render.preview}
    <div class="stack">
      <!-- Keyed by line id so overlapping lines never swap identity mid-render. -->
      {#each render.active as active (active.line.id)}
        <LyricLine
          line={active.line}
          activeTokenIndex={active.activeTokenIndex}
          emphasis="active"
        />
      {/each}

      {#if render.preview}
        <LyricLine
          line={render.preview}
          activeTokenIndex={-1}
          emphasis="preview"
        />
      {/if}
    </div>
  {/if}
</div>

<style>
  .overlay {
    position: absolute;
    inset: 0;
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    pointer-events: none;
    padding: var(--pad);
    /* Leave room for the controls so the overlay never occludes them (FR-012). */
    padding-bottom: calc(var(--hit) + var(--pad) * 2);
  }

  .overlay[data-placement='bottom'] { justify-content: flex-end; }
  .overlay[data-placement='center'] { justify-content: center; }
  .overlay[data-placement='top'] { justify-content: flex-start; }

  .stack {
    display: flex;
    flex-direction: column;
    gap: var(--line-gap);
    align-items: center;
    text-align: center;
    /* The scrim: contrast is measured against THIS, not against the video. */
    background: var(--scrim);
    border-radius: var(--radius);
    padding: var(--pad);
    max-width: 100%;
  }
</style>
