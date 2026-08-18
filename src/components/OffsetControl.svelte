<script lang="ts">
  import { formatOffset } from '../lib/format.js';

  /** FR-013 — signed, immediate, session-persistent, with the direction spelled out. */
  interface Props {
    offset: number;
    onchange: (seconds: number) => void;
  }
  let { offset, onchange }: Props = $props();

  const nudge = (d: number) => onchange(Math.round((offset + d) * 100) / 100);
</script>

<div class="offset" data-testid="offset">
  <button onclick={() => nudge(-0.1)} aria-label="Lyrics 0.1 seconds earlier">−</button>
  <span class="label" data-testid="offset-label">{formatOffset(offset)}</span>
  <button onclick={() => nudge(0.1)} aria-label="Lyrics 0.1 seconds later">+</button>
  <button class="reset" onclick={() => onchange(0)} disabled={offset === 0}>Reset</button>
</div>

<style>
  .offset { display: flex; align-items: center; gap: 0.35rem; }
  .label { min-width: 9ch; text-align: center; font-size: 0.85rem; color: var(--ui-muted); }
  button { border: 1px solid rgb(255 255 255 / 0.15); border-radius: var(--radius); padding: 0 0.6rem; }
  .reset { font-size: 0.8rem; }
  .reset:disabled { opacity: 0.4; cursor: default; }
</style>
