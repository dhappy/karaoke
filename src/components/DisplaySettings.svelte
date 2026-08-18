<script lang="ts">
  import type { PrefsState, ColorScheme, Placement } from '../state/prefs.svelte.js';

  /** FR-014 — applies immediately, no reload, no playback interruption. */
  interface Props { prefs: PrefsState }
  let { prefs }: Props = $props();
</script>

<div class="settings" data-testid="display-settings">
  <label>
    <span>Size</span>
    <input
      type="range" min="0.6" max="2.2" step="0.05"
      value={prefs.textScale}
      data-testid="text-scale"
      oninput={(e) => (prefs.textScale = Number((e.currentTarget as HTMLInputElement).value))}
    />
  </label>

  <label>
    <span>Colours</span>
    <select
      value={prefs.colorScheme}
      data-testid="scheme"
      onchange={(e) => (prefs.colorScheme = (e.currentTarget as HTMLSelectElement).value as ColorScheme)}
    >
      <option value="classic">Classic</option>
      <option value="high-contrast">High contrast</option>
      <option value="warm">Warm</option>
      <option value="cool">Cool</option>
    </select>
  </label>

  <label>
    <span>Position</span>
    <select
      value={prefs.placement}
      data-testid="placement"
      onchange={(e) => (prefs.placement = (e.currentTarget as HTMLSelectElement).value as Placement)}
    >
      <option value="bottom">Bottom</option>
      <option value="center">Centre</option>
      <option value="top">Top</option>
    </select>
  </label>
</div>

<style>
  .settings { display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap; }
  label { display: flex; align-items: center; gap: 0.35rem; font-size: 0.85rem; color: var(--ui-muted); min-height: var(--hit); }
  /* FR-012: the 44px floor applies to these too — they were 32px. */
  select, input { min-height: var(--hit); background: var(--ui-bg); color: var(--ui-fg); border: 1px solid rgb(255 255 255 / 0.15); border-radius: var(--radius); }
  input[type='range'] { width: 6rem; }
</style>
