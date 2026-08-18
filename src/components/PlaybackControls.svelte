<script lang="ts">
  import type { MediaState } from '../state/media.svelte.js';
  import { formatTime } from '../lib/format.js';

  export type PlaybackCommand =
    | { type: 'play' } | { type: 'pause' } | { type: 'toggle-fullscreen' }
    | { type: 'seek'; to: number } | { type: 'volume'; level: number }
    | { type: 'mute'; on: boolean } | { type: 'rate'; value: number };

  /**
   * FR-011. The scrubber reads `media.scrubPosition`, which is throttled from
   * `timeupdate` (~4Hz) — deliberately NOT the frame clock. A seek bar does not
   * need 60Hz, and wiring it to the frame clock would reintroduce the
   * Constitution III violation through the back door.
   */
  interface Props {
    media: MediaState;
    oncommand: (c: PlaybackCommand) => void;
  }
  let { media, oncommand }: Props = $props();

  const duration = $derived(media.duration ?? 0);
</script>

<div class="controls" data-testid="controls">
  <button
    onclick={() => oncommand({ type: media.playing ? 'pause' : 'play' })}
    aria-label={media.playing ? 'Pause' : 'Play'}
    data-testid="play"
  >{media.playing ? '❚❚' : '▶'}</button>

  <span class="time" data-testid="elapsed">{formatTime(media.scrubPosition)}</span>

  <input
    class="scrub"
    type="range"
    min="0"
    max={duration || 1}
    step="0.01"
    value={media.scrubPosition}
    aria-label="Seek"
    data-testid="scrub"
    oninput={(e) => oncommand({ type: 'seek', to: Number((e.currentTarget as HTMLInputElement).value) })}
  />

  <span class="time" data-testid="duration">{formatTime(duration)}</span>

  <button
    onclick={() => oncommand({ type: 'mute', on: !media.muted })}
    aria-label={media.muted ? 'Unmute' : 'Mute'}
    data-testid="mute"
  >{media.muted ? '🔇' : '🔊'}</button>

  <input
    class="vol"
    type="range" min="0" max="1" step="0.01"
    value={media.volume}
    aria-label="Volume"
    oninput={(e) => oncommand({ type: 'volume', level: Number((e.currentTarget as HTMLInputElement).value) })}
  />

  <label class="rate">
    <span class="sr">Speed</span>
    <select
      value={String(media.rate)}
      data-testid="rate"
      onchange={(e) => oncommand({ type: 'rate', value: Number((e.currentTarget as HTMLSelectElement).value) })}
    >
      {#each ['0.5', '0.75', '1', '1.25', '1.5', '2'] as r}
        <option value={r}>{r}×</option>
      {/each}
    </select>
  </label>

  <button
    onclick={() => oncommand({ type: 'toggle-fullscreen' })}
    aria-label="Toggle fullscreen"
    data-testid="fullscreen"
  >⛶</button>
</div>

<style>
  .controls {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    padding: 0.4rem 0.6rem;
    background: var(--ui-bg);
    /* Above the overlay so lyrics never occlude the controls (FR-012). */
    position: relative;
    z-index: 2;
  }
  .scrub { flex: 1 1 12rem; min-width: 8rem; height: var(--hit); }
  .vol { flex: 0 1 6rem; height: var(--hit); }
  .time { font-variant-numeric: tabular-nums; color: var(--ui-muted); font-size: 0.85rem; }
  select { min-height: var(--hit); background: var(--ui-bg); color: var(--ui-fg); border: 1px solid rgb(255 255 255 / 0.15); border-radius: var(--radius); }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }

  @media (max-width: 30rem) {
    .vol { display: none; }
  }
</style>
